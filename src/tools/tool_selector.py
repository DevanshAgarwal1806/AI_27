import os
import json
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from src.config.settings import (
    TOOL_MATCH_THRESHOLD,
    TOOL_MAX_GENERALIZATION_STEPS,
)
from src.config.keypool import pool

# ── Confidence threshold ──────────────────────────────────────────────────────
# Score returned by the LLM judge. Below this, we consider it a poor match
# and trigger the generalizer.
MATCH_THRESHOLD = TOOL_MATCH_THRESHOLD  # out of 10
MAX_GENERALIZATION_STEPS = TOOL_MAX_GENERALIZATION_STEPS


# ── Public warning store ──────────────────────────────────────────────────────
# Warnings are appended here during execution and surfaced to the user
# at the end of the run. This is a simple list; you could also add it
# to SynapseState if you want it persisted across graph checkpoints.
execution_warnings: list[dict] = []


def select_tool(task: dict, tool_map: dict[str, object]) -> tuple[object | None, str]:
    """
    Given a task dict and a {name: tool} map, returns:
      (tool_object, input_string)

    If no confident match is found after generalization, returns (None, "").
    Appends a warning to `execution_warnings` whenever generalization occurs.
    """
    original_description = task.get("description", "")
    current_description = original_description

    for step in range(MAX_GENERALIZATION_STEPS + 1):
        tool_name, tool_input, score = _score_tools(current_description, tool_map)

        if score >= MATCH_THRESHOLD:
            if step > 0:
                # Generalization was needed — record a warning
                execution_warnings.append({
                    "task_id":      task.get("id", "unknown"),
                    "original":     original_description,
                    "simplified":   current_description,
                    "tool_chosen":  tool_name,
                    "steps_taken":  step,
                })
                _print_warning(task.get("id"), original_description, current_description)

            return tool_map[tool_name], tool_input

        if step < MAX_GENERALIZATION_STEPS:
            print(
                f"--- Tool match score {score}/10 below threshold "
                f"(step {step + 1}/{MAX_GENERALIZATION_STEPS}). Generalizing... ---"
            )
            current_description = _generalize(
                original_description=original_description,
                current_description=current_description,
                tool_map=tool_map,
                step=step,
            )

    # Exhausted all generalization steps — no match
    execution_warnings.append({
        "task_id":      task.get("id", "unknown"),
        "original":     original_description,
        "simplified":   current_description,
        "tool_chosen":  None,
        "steps_taken":  MAX_GENERALIZATION_STEPS,
    })
    _print_warning(task.get("id"), original_description, current_description, failed=True)
    return None, ""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _score_tools(
    description: str,
    tool_map: dict[str, object],
) -> tuple[str, str, int]:
    """
    Asks Groq to pick the best tool for the description and score its confidence.
    Returns (tool_name, tool_input, score).
    """
    tool_manifest = "\n".join(
        f"- {name}: {tool.description}"
        for name, tool in tool_map.items()
    )

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.0,
        api_key=pool.next(),
    )

    messages = [
        SystemMessage(content=(
            "You are a tool-selection expert. "
            "Given a task description and a list of available tools, "
            "pick the single best tool and craft the exact input string for it.\n\n"
            "Respond ONLY with a JSON object — no explanation, no markdown:\n"
            '{"tool_name": "<exact name>", '
            '"tool_input": "<the search query or argument string>", '
            '"score": <integer 0-10 representing how well the tool fits the task>}'
        )),
        HumanMessage(content=(
            f"Task: {description}\n\n"
            f"Available tools:\n{tool_manifest}"
        )),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()

    start, end = raw.find('{'), raw.rfind('}')
    if start == -1 or end == -1:
        return _fallback_tool(tool_map), description, 0

    try:
        parsed = json.loads(raw[start:end + 1])
        name  = parsed.get("tool_name", "")
        inp   = parsed.get("tool_input", description)
        score = int(parsed.get("score", 0))

        if name not in tool_map:
            return _fallback_tool(tool_map), inp, 0

        return name, inp, score

    except (json.JSONDecodeError, ValueError):
        return _fallback_tool(tool_map), description, 0


def _generalize(
    original_description: str,
    current_description: str,
    tool_map: dict[str, object],
    step: int,
) -> str:
    """
    Asks Groq to produce a slightly simpler/broader version of the task
    description that is more likely to match an available tool.
    """
    tool_manifest = "\n".join(
        f"- {name}: {tool.description}"
        for name, tool in tool_map.items()
    )

    aggressiveness = ["slightly", "moderately", "significantly", "drastically"][
        min(step, 3)
    ]

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        api_key=pool.next(),
    )

    messages = [
        SystemMessage(content=(
            "You are helping an AI agent find a usable tool for a task it cannot "
            "execute precisely. Your job is to rewrite the task description to be "
            f"{aggressiveness} more general or simplified, so that one of the "
            "available tools can handle it.\n\n"
            "Rules:\n"
            "1. Preserve the core intent of the original task.\n"
            "2. Remove hyper-specific constraints that no tool can satisfy.\n"
            "3. Output ONLY the rewritten task description as a plain string. "
            "No JSON, no explanation, no quotes."
        )),
        HumanMessage(content=(
            f"Original task: {original_description}\n"
            f"Current version: {current_description}\n\n"
            f"Available tools:\n{tool_manifest}\n\n"
            f"Write a {aggressiveness} more general version of the current task:"
        )),
    ]

    response = llm.invoke(messages)
    generalized = response.content.strip().strip('"').strip("'")

    print(f"    Generalized ({aggressiveness}): {generalized}")
    return generalized


def _fallback_tool(tool_map: dict[str, object]) -> str:
    """Returns the name of the first available tool as a last resort."""
    return next(iter(tool_map))


def _print_warning(
    task_id: str,
    original: str,
    simplified: str,
    failed: bool = False,
) -> None:
    sep = "─" * 60
    if failed:
        print(f"\n⚠  WARNING [{task_id}]\n{sep}")
        print(f"   No appropriate tool found after {MAX_GENERALIZATION_STEPS} attempts.")
        print(f"   Original task : {original}")
        print(f"   Final attempt : {simplified}")
        print(f"   This task will be skipped.\n{sep}\n")
    else:
        print(f"\n⚠  WARNING [{task_id}]\n{sep}")
        print(f"   No exact tool match. Task was simplified to find a usable tool.")
        print(f"   Original task : {original}")
        print(f"   Simplified to : {simplified}")
        print(f"{sep}\n")