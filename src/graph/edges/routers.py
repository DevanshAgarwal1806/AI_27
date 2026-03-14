from src.graph.state import SynapseState

def route_evaluation(state: SynapseState) -> str:
    """
    Determines whether to loop back to the generator or proceed to execution.
    """
    score = state.get("judge_score", 0)
    loop_count = state.get("loop_count", 0)
    
    MAX_RETRIES = 3
    PASSING_SCORE = 13  # Out of 15 (5 for cycles, 10 for Gemini metrics)
    
    if score >= PASSING_SCORE:
        print(f"--- DAG APPROVED (Score: {score}/15) -> PROCEEDING TO EXECUTION ---")
        return "execute"
        
    elif loop_count >= MAX_RETRIES:
        print(f"--- MAX RETRIES REACHED ({MAX_RETRIES}). FORCING EXECUTION WITH BEST ATTEMPT ---")
        # You could also route to a "fallback" node here that returns a safe error to the user,
        # but often it's better to try executing the flawed DAG rather than failing completely.
        return "execute"
        
    else:
        print(f"--- DAG REJECTED (Score: {score}/15). LOOPING BACK TO GENERATOR ---")
        return "generate"