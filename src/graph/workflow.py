from langgraph.graph import StateGraph, END
from src.graph.state import SynapseState
from src.graph.nodes.generator import generate_dag
from src.graph.nodes.evaluator import evaluate_dag
from src.graph.edges.routers import route_evaluation

def build_synapse_graph():
    """
    Compiles the LangGraph for SynapseAI.
    """
    # 1. Initialize the StateGraph with our TypedDict
    builder = StateGraph(SynapseState)

    # 2. Add the nodes
    builder.add_node("generator", generate_dag)
    builder.add_node("evaluator", evaluate_dag)
    
    # Placeholder for Phase 2/3 nodes
    # builder.add_node("executor", execute_task)
    # builder.add_node("reflector", reflect_on_execution)

    # 3. Define the Entry Point
    builder.set_entry_point("generator")

    # 4. Define the Standard Edges
    # After generation, it MUST go to evaluation
    builder.add_edge("generator", "evaluator")

    # 5. Define Conditional Edges (The Convergence Loop)
    builder.add_conditional_edges(
        "evaluator",             # The starting node
        route_evaluation,        # The routing function
        {
            "generate": "generator", # If route_evaluation returns "generate", go to generator
            "execute": END           # Temporarily routing to END. Once we build the executor, this will map to "executor"
        }
    )

    # 6. Compile the graph
    graph = builder.compile()
    
    return graph