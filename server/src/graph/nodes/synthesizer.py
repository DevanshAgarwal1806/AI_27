from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from src.graph.state import SynapseState
from src.config.keypool import pool


def synthesize_output(state: SynapseState) -> dict:
    print("--- SYNTHESIZING FINAL OUTPUT ---")

    scratchpad  = state.get("reflexion_scratchpad", [])
    user_prompt = state.get("user_prompt", "")
    dag         = state.get("current_dag", {})

    # Collect all successful results, labelled by their task description
    task_lookup = {
        task["id"]: task.get("description", task["id"])
        for task in dag.get("tasks", [])
    }

    successful_results = []
    for entry in scratchpad:
        if entry.startswith("SUCCESS"):
            parts     = entry.split("|")
            task_id   = parts[1] if len(parts) > 1 else "unknown"
            content   = parts[2] if len(parts) > 2 else ""
            task_desc = task_lookup.get(task_id, task_id)
            successful_results.append(
                f"[{task_desc}]\n{content}"
            )

    if not successful_results:
        state.useful_output = False
        return {
            "final_output": (
                "The agent was unable to complete any tasks successfully. "
                "Please check the warnings above and try again."
            )
        }

    # Build the context block for the LLM
    gathered_context = "\n\n---\n\n".join(successful_results)

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        api_key=pool.next()
    )

    messages = [
        SystemMessage(content=(
            "You are a research synthesizer. "
            "You will be given a user's original question and a set of raw research "
            "results gathered by an AI agent. "
            "Your job is to write a single, clear, well-structured response that "
            "directly answers the user's question using only the provided results.\n\n"
            "Rules:\n"
            "1. Write in plain English. No bullet soup — use paragraphs with "
            "   headers where helpful.\n"
            "2. Directly answer the user's question first, then provide supporting "
            "   detail.\n"
            "3. If results are incomplete or conflicting, say so honestly.\n"
            "4. Do not invent facts. Only use what is in the provided results.\n"
            "5. Keep the response concise but complete — no padding."
        )),
        HumanMessage(content=(
            f"User's original question:\n{user_prompt}\n\n"
            f"Research results gathered by the agent:\n\n{gathered_context}"
        ))
    ]

    response = llm.invoke(messages)
    final    = response.content.strip()

    return {"final_output": final}