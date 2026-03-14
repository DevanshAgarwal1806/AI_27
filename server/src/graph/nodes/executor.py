from src.graph.state import SynapseState
from src.tools.registry import get_all_tools
from src.tools.tool_selector import select_tool


def _get_pending_task(dag: dict, scratchpad: list) -> dict | None:
    completed_ids = set()
    failed_ids = set()

    for entry in scratchpad:
        if entry.startswith("SUCCESS:"):
            completed_ids.add(entry.split(":")[1].strip().split(" ")[0])
        elif entry.startswith("FAILURE:"):
            failed_ids.add(entry.split(":")[1].strip().split(" ")[0])

    for task in dag.get("tasks", []):
        task_id = task["id"]
        if task_id in completed_ids or task_id in failed_ids:
            continue
        if all(dep in completed_ids for dep in task.get("dependencies", [])):
            return task

    return None


def execute_task(state: SynapseState) -> dict:
    print("--- EXECUTING TASK ---")

    dag = state.get("current_dag", {})
    scratchpad = state.get("reflexion_scratchpad", [])

    task = _get_pending_task(dag, scratchpad)

    if task is None:
        print("--- ALL TASKS COMPLETE ---")
        return {
            "current_step_id": "DONE",
            "final_output": _compile_final_output(scratchpad),
        }

    task_id = task["id"]
    print(f"--- Task: {task_id} | {task.get('description', '')} ---")

    tool_map = {t.name: t for t in get_all_tools()}

    # Let the selector decide which tool to use (and generalize if needed)
    tool, tool_input = select_tool(task, tool_map)

    if tool is None:
        # Selector exhausted all generalization steps — skip this task
        return {
            "current_step_id": task_id,
            "reflexion_scratchpad": [
                f"FAILURE:{task_id}: No suitable tool found after generalization. Task skipped."
            ],
        }

    print(f"--- Running: {tool.name}({tool_input!r}) ---")

    try:
        raw_result = str(tool.invoke(tool_input))
    except Exception as e:
        raw_result = f"TOOL_ERROR: {str(e)}"

    return {
        "current_step_id": task_id,
        "reflexion_scratchpad": [f"RAW_RESULT:{task_id}:{raw_result[:2000]}"],
    }


def _compile_final_output(scratchpad: list) -> str:
    lines = [e for e in scratchpad if e.startswith("SUCCESS:")]
    return "\n\n".join(lines) if lines else "Execution complete. No successful outputs recorded."