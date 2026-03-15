# SynapseAI: Autonomous Agentic Orchestrator

An autonomous AI agent designed to decompose complex human prompts into executable **Directed Acyclic Graphs (DAGs)**. It features a self-evolving planning loop, dynamic tool-calling via OpenAPI specifications, and a "Reflexion" based contextual memory system.

---

## Problem Statement
Design and develop an autonomous AI agent capable of decomposing complex tasks into sub-tasks, selecting appropriate tools (APIs, databases, search engines), maintaining contextual memory, and executing multi-step workflows with minimal human intervention.


### Challenges faced by traditional AI tools
The current generation of AI tools suffers from a significant bottleneck, they require too much human intervention, for any particular task, humans are required to evaluate the output at every step and give constant feedback, this is where most professionals using Agentic Agents end up wasting huge amounts of energy and time.

While modern LLMs are powerful, current agentic tools frequently stall, hallucinate, or lose track of the objective, requiring a human user to constantly "nudge", correct, or restart the process.

**SynapseAI** is built to bridge this gap. Our goal is to drastically decrease human oversight by implementing a self-correcting architecture that:
1.  **Self-Evaluates:** Uses an "LLM-as-a-Judge" loop to refine plans before execution.
2.  **Self-Configures:** Ingests entire API suites via OpenAPI specs to eliminate manual tool setup.
3.  **Self-Corrects:** Employs a "Reflexion" phase to observe failures and re-route logic autonomously.

---

##  The Workflow

A LangGraph state is initialised and the work of task decomposition and execution is performed by the nodes in the graph. A state is implicitly maintained by the LangGraph and passed through every step. 

### Phase 1: Task Decomposition & The "Judge" Graph
We break the problem into four pillars: task decomposition, tool selection, memory management, and workflow execution.

* **DAG Generation:** Using **Groq**, the agent generates a Directed Acyclic Graph (DAG) in JSON format.
* **LLM-as-a-Judge:** **Gemini Flash 2.0** scrutinizes the proposed DAG for logic and feasibility.
* **Evaluation Metric:** Using **DeepEval**, we calculate an **Answer Relevancy** score.
* **Convergence Loop:** The Generator and Judge iterate on the JSON structure until the score converges to a high-confidence threshold. This ensures the agent has a solid plan before a single tool is called, minimizing the need for human course-correction.

### Phase 2: Dynamic Tool Selection (OpenAPI Driven)
To execute sub-tasks without developer overhead, the agent dynamically expands its own capabilities.

* **Automated Tool Generation:** By providing **OpenAPI JSON files**, the framework instantly understands an API's endpoints and generates the necessary tools on the fly.
* **Ecosystem Integration:** Leveraging `langchain-community` for research tools like **Arxiv**, **Wikipedia**, and **GitHub**.
* **Agent-Optimized Search:** Utilizing **Tavily** for structured web intelligence, providing the agent with clean JSON summaries rather than messy HTML.

### Phase 3: Execution & Reflexion Graph (Autonomous Recovery)
This phase focusses on the execution of the DAG. LangGraph executes it step-by-step, using its cyclic nature to handle errors without human help.

* **Executor Node**: The agent picks the first task in the DAG and uses a tool (from Phase 2). The raw API response is saved to the State.
* **Reflexion/Observer Node**: An LLM reads the raw response in the State, extracts only task-specific values (such as status_code), and updates the State.
* **Recovery Loop**: If the tool succeeded, it loops back to the executor node to execute the next task in the DAG. If not, it re-executes the task with a new tool. 

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Inference (Planning)** | **Groq** (Llama 3 / 70B) |
| **Reasoning (Evaluation)** | **Gemini Flash 2.0** |
| **Testing Framework** | **DeepEval** (Answer Relevancy) |
| **Orchestration and State** | **LangGraph** |
| **State Management** | **Custom JSON Structure** |
| **Tooling Protocols** | **OpenAPI (Swagger)** |
| **Search Intelligence** | **Tavily API** |

---

## Impact: Minimizing Intervention
By moving the "logic check" from the human to the **Gemini-powered Judge** and the "correction phase" to the **Reflexion module**, SynapseAI transforms the user from a "babysitter" into a "supervisor." The agent handles the messy middle of task execution, only returning to the human once the objective is met.

## Directory Structure

```
SynapseAI/
├── src/                        # All your core application code lives here
│   ├── graph/                  # The LangGraph Orchestrator (The Brain)
│   │   ├── __init__.py
│   │   ├── state.py            # Defines the AgentForgeState (your TypedDict)
│   │   ├── workflow.py         # Compiles the StateGraph and connects everything
│   │   ├── nodes/              # The functions that actually do the work
│   │   │   ├── __init__.py
│   │   │   ├── generator.py    # Phase 1: Groq DAG generation logic
│   │   │   ├── evaluator.py    # Phase 1: Gemini + DeepEval scoring logic
│   │   │   ├── executor.py     # Phase 2 & 3: Tool execution logic
│   │   │   └── reflector.py    # Phase 3: Reflexion and recovery logic
│   │   └── edges/              # The routing logic
│   │       ├── __init__.py
│   │       └── routers.py      # Conditional edge functions (e.g., route_evaluation)
│   ├── tools/                  # The Agent's Hands
│   │   ├── __init__.py
│   │   ├── openapi_parser.py   # Code to ingest specs and generate dynamic tools
│   │   ├── search.py           # Tavily API integration
│   │   └── ecosystem.py        # langchain-community integrations (GitHub, Arxiv)
│   ├── config/                 # Configurations and Prompts
│   │   ├── __init__.py
│   │   ├── prompts.py          # Centralized system prompts for Groq, Gemini, etc.
│   │   └── settings.py         # Environment variable loaders
│   └── api/                    # (Optional) FastAPI routes if building a frontend
│       ├── __init__.py
│       └── server.py           
├── data/                       # Local data storage
│   ├── openapi_specs/          # Drop your raw Swagger JSON/YAML files here
│   └── scratchpads/            # Local SQLite database for LangGraph Checkpointer
├── evals/                      # DeepEval testing framework
│   ├── __init__.py
│   └── test_dag_relevancy.py   # Your custom evaluation metrics
├── .env                        # YOUR API KEYS (Never commit this to GitHub!)
├── .gitignore                  # Tells Git to ignore .env and __pycache__
├── requirements.txt            # All your pip install dependencies
└── README.md                   # The architecture document you shared earlier
```

---


Run backend:
cd server
pip install -r requirements.txt
python -m uvicorn src.api.server:app --host 127.0.0.1 --port 8000 --reload

Run frontend:
npm i 
npm run dev