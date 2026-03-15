import os
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from src.graph.state import SynapseState
from src.config.prompts import REFLECTOR_SYSTEM_PROMPT
from src.config.keypool import pool

def reflect_on_execution(state: SynapseState) -> dict:
    """
    Phase 3: Reads the raw tool result from the scratchpad, determines
    success or failure, extracts the useful value, and writes a
    structured log entry back to the scratchpad.
    """
    print("--- REFLECTING ON RESULT ---")

    scratchpad = state.get("reflexion_scratchpad", [])
    task_id = state.get("current_step_id", "unknown")
    dag = state.get("current_dag", {})

    # Find the most recent RAW_RESULT for this task
    raw_entry = ""
    for entry in reversed(scratchpad):
        if entry.startswith(f"RAW_RESULT:{task_id}:"):
            raw_entry = entry[len(f"RAW_RESULT:{task_id}:"):]
            break

    if not raw_entry:
        # Nothing to reflect on — shouldn't happen, but handle gracefully
        return {
            "reflexion_scratchpad": [f"FAILURE:{task_id}: No raw result found to reflect on."]
        }

    # Find the task's objective from the DAG for context
    task_obj = next(
        (t for t in dag.get("tasks", []) if t["id"] == task_id),
        {}
    )
    task_description = task_obj.get("description", task_obj.get("name", task_id))

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.0,
        api_key=pool.next()
    )

    messages = [
        SystemMessage(content=REFLECTOR_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Task ID: {task_id}\n"
            f"Task objective: {task_description}\n\n"
            f"Raw tool output:\n{raw_entry}\n\n"
            "Respond with a JSON object containing "
            "{\"status\": \"SUCCESS\" or \"FAILURE\", "
            "\"extracted_value\": \"the key fact or result from the output\", "
            "\"reason\": \"a short explanation\"}. "
            "Prefer \"SUCCESS\" if the output is reasonably relevant or partially correct. "
            "Return \"FAILURE\" only if the output clearly does not address the task or is unusable. "
            "Ensure the response is valid JSON."
        ))
    ]

    response = llm.invoke(messages)
    raw_response = response.content.strip()

    # Parse the reflection verdict
    start = raw_response.find('{')
    end = raw_response.rfind('}')
    verdict = {"status": "FAILURE", "extracted_value": "", "reason": "Parse error"}

    if start != -1 and end != -1:
        try:
            verdict = __import__('json').loads(raw_response[start:end + 1])
        except Exception:
            pass

    status = verdict.get("status", "FAILURE")
    extracted = verdict.get("extracted_value", "")
    reason = verdict.get("reason", "")

    log_entry = f"{status}:{task_id}: {extracted} | Reason: {reason}"
    print(f"--- Reflection verdict: {log_entry} ---")

    return {
        "reflexion_scratchpad": [log_entry]
    }