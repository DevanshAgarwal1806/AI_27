import os
import json
from dotenv import load_dotenv

# Load environment variables before importing anything else!
load_dotenv()

from src.graph.workflow import build_synapse_graph

def test_generation_loop():
    print("Initializing SynapseAI Phase 1 Test...\n")
    
    # 1. Compile the Orchestrator Graph
    app = build_synapse_graph()
    
    # 2. Define the starting state with a test prompt
    initial_state = {
        "user_prompt": "Write a Python script that fetches the top 5 articles from Arxiv about Agentic RAG, summarizes them, and saves the output to a local markdown file.",
        "current_dag": {},
        "judge_score": 0.0,
        "feedback": "",
        "loop_count": 0,
        "current_step_id": "",
        "reflexion_scratchpad": [],
        "final_output": ""
    }
    
    print(f"Target Objective: {initial_state['user_prompt']}\n")
    print("-" * 50)
    
    # 3. Invoke the graph (This starts the Groq -> Gemini -> Groq loop)
    final_state = app.invoke(initial_state)
    
    # 4. Print the final results
    print("\n" + "=" * 50)
    print("🏁 PHASE 1 COMPLETE: FINAL APPROVED DAG")
    print("=" * 50)
    print(f"Total Generation Attempts: {final_state['loop_count']}")
    print(f"Final Judge Score: {final_state['judge_score']}/15")
    print("\nFinal DAG JSON:")
    print(json.dumps(final_state["current_dag"], indent=2))

if __name__ == "__main__":
    test_generation_loop()