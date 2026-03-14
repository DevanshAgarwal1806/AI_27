import os
import json
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from src.graph.state import SynapseState
from src.config.prompts import GENERATOR_SYSTEM_PROMPT

def generate_dag(state: SynapseState) -> dict:
    """
    Phase 1: Generates or refines a DAG based on the user prompt.
    """
    print("--- GENERATING DAG (Groq) ---")
    
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.2, 
        api_key=os.getenv("GROQ_API_KEY")
    )
    
    user_prompt = state.get("user_prompt", "")
    feedback = state.get("feedback", "")
    loop_count = state.get("loop_count", 0)
    judge_score = state.get("judge_score", 0) # Fetch the score from state
    
    user_content = f"Target Objective: {user_prompt}"
    
    if feedback and loop_count > 0:
        # Inject the score into the prompt so Groq knows how badly it failed
        user_content += f"\n\nCRITICAL: Your previous DAG was rejected with a score of {judge_score}/15. Here is the Judge's feedback:\n{feedback}\n\nPlease output an updated JSON DAG that fixes these issues."
        
    messages = [
        SystemMessage(content=GENERATOR_SYSTEM_PROMPT),
        HumanMessage(content=user_content)
    ]
    
    response = llm.invoke(messages)
    raw_output = response.content.strip()
    
    # --- IMPROVED JSON EXTRACTION ---
    # Find the first '{' and the last '}'
    start_idx = raw_output.find('{')
    end_idx = raw_output.rfind('}')
    
    if start_idx != -1 and end_idx != -1:
        json_string = raw_output[start_idx:end_idx+1]
        try:
            dag_json = json.loads(json_string)
        except json.JSONDecodeError:
            dag_json = {"tasks": [], "error": "Extracted string was not valid JSON."}
    else:
        dag_json = {"tasks": [], "error": "No JSON brackets found in output."}
        
    # We increment the loop_count here. The router will use this to prevent infinite loops.
    return {
        "current_dag": dag_json,
        "loop_count": loop_count + 1
    }