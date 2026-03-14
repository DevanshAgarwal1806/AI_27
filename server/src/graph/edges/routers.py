from src.graph.state import SynapseState
from src.config.settings import (
    DAG_MAX_RETRIES,
    DAG_PASSING_SCORE,
    TASK_MAX_RETRIES,
)


MAX_RETRIES = DAG_MAX_RETRIES
PASSING_SCORE = DAG_PASSING_SCORE

def route_evaluation(state: SynapseState) -> str:
    score = state.get("judge_score", 0)
    loop_count = state.get("loop_count", 0)

    if score >= PASSING_SCORE:
        print(f"--- DAG APPROVED (Score: {score}/15) -> PROCEEDING TO EXECUTION ---")
        return "execute"
    elif loop_count >= MAX_RETRIES:
        print(f"--- MAX RETRIES REACHED. FORCING EXECUTION ---")
        return "execute"
    else:
        print(f"--- DAG REJECTED (Score: {score}/15). LOOPING BACK ---")
        return "generate"


def route_execution(state: SynapseState) -> str:
    """
    After the reflector writes its verdict, decide what to do next:
    - 'next_task'  → success, more tasks pending
    - 'done'       → success, DAG fully complete
    - 'retry'      → failure, retry budget remaining
    - 'fail'       → failure, retry budget exhausted
    """
    task_id = state.get("current_step_id", "")
    scratchpad = state.get("reflexion_scratchpad", [])
    dag = state.get("current_dag", {})

    # Short-circuit: executor already set DONE
    if task_id == "DONE":
        return "done"

    # Count retries for the current task
    retry_count = sum(
        1 for e in scratchpad
        if e.startswith(f"FAILURE:{task_id}:")
    )

    MAX_TASK_RETRIES = TASK_MAX_RETRIES

    # Check the most recent verdict for this task
    last_verdict = ""
    for entry in reversed(scratchpad):
        if entry.startswith(f"SUCCESS:{task_id}:") or entry.startswith(f"FAILURE:{task_id}:"):
            last_verdict = entry
            break

    if last_verdict.startswith(f"SUCCESS:{task_id}:"):
        # Check if more tasks remain
        completed = {e.split(":")[1].strip().split(" ")[0] for e in scratchpad if e.startswith("SUCCESS:")}
        total_tasks = len(dag.get("tasks", []))
        if len(completed) >= total_tasks:
            print("--- All tasks complete → DONE ---")
            return "done"
        print("--- Task succeeded → NEXT TASK ---")
        return "next_task"

    # It was a failure
    if retry_count < MAX_TASK_RETRIES:
        print(f"--- Task {task_id} failed (attempt {retry_count + 1}/{MAX_TASK_RETRIES}) → RETRY ---")
        return "retry"
    else:
        print(f"--- Task {task_id} failed after {MAX_TASK_RETRIES} attempts → FAIL ---")
        return "fail"