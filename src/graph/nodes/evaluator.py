import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from src.graph.state import SynapseState
from src.config.prompts import EVALUATOR_SYSTEM_PROMPT

def check_for_cycles(tasks: list) -> bool:
    """
    Returns True if a cycle is detected in the task dependencies, False otherwise.
    Uses Depth-First Search (DFS).
    """
    # Create an adjacency list representing the graph
    graph = {task["id"]: task.get("dependencies", []) for task in tasks}
    visited = set()
    rec_stack = set()

    def dfs(node):
        visited.add(node)
        rec_stack.add(node)
        
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True # Cycle detected
                
        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            if dfs(node):
                return True
    return False

def evaluate_dag(state: SynapseState) -> dict:
    """
    Phase 1: Evaluates the DAG based on a custom 10-point metric.
    (5 marks for no cycles, 5 marks for relevance to prompt)
    """
    print("--- EVALUATING DAG (Custom Metric) ---")
    
    dag = state.get("current_dag", {})
    tasks = dag.get("tasks", [])
    user_prompt = state.get("user_prompt", "")
    
    total_score = 0
    feedback_notes = []
    
    # --- METRIC 1: Cycle Detection (5 Marks) ---
    # (Cycle detection code remains exactly the same)
    if not tasks:
        feedback_notes.append("CRITICAL: No tasks generated or JSON formatting failed.")
    elif check_for_cycles(tasks):
        feedback_notes.append("CRITICAL: Cycle detected in DAG dependencies.")
    else:
        total_score += 5  
        
    # --- METRICS 2 & 3: Relevance & Dependencies via Gemini (10 Marks) ---
    judge_llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash-latest",
        temperature=0.0,
        api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    user_content = f"Objective: {user_prompt}\n\nProposed DAG:\n{json.dumps(dag, indent=2)}"
    
    messages = [
        SystemMessage(content=EVALUATOR_SYSTEM_PROMPT),
        HumanMessage(content=user_content)
    ]
    
    response = judge_llm.invoke(messages)
    raw_response = response.content.strip()
    
    start_idx = raw_response.find('{')
    end_idx = raw_response.rfind('}')
    
    if start_idx != -1 and end_idx != -1:
        try:
            gemini_eval = json.loads(raw_response[start_idx:end_idx+1])
            
            # Extract both scores
            relevance_score = gemini_eval.get("relevance_score", 0)
            dependency_score = gemini_eval.get("dependency_score", 0)
            gemini_feedback = gemini_eval.get("feedback", "No feedback provided.")
            
            # Add to total (Max is now 5 + 5 + 5 = 15)
            total_score += (relevance_score + dependency_score)
            
            if gemini_feedback != "APPROVED":
                feedback_notes.append(f"Logic Feedback: {gemini_feedback}")
                
        except json.JSONDecodeError:
            feedback_notes.append("Judge evaluation failed to parse correctly.")
    
    final_feedback = "\n".join(feedback_notes) if feedback_notes else "APPROVED"

    return {
        "judge_score": total_score, # Now out of 15
        "feedback": final_feedback
    }