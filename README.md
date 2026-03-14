# AgentForge: Autonomous Agentic Orchestrator

An autonomous AI agent designed to decompose complex human prompts into executable **Directed Acyclic Graphs (DAGs)**. It features a self-evolving planning loop, dynamic tool-calling via OpenAPI specifications, and a "Reflexion" based contextual memory system.

---

## Problem Statement
The current generation of AI agents suffers from a significant bottleneck: **excessive human intervention.** While modern LLMs are powerful, current agentic tools frequently stall, hallucinate, or lose track of the objective, requiring a human user to constantly "nudge," correct, or restart the process.

**AutoDAG** is built to bridge this gap. Our goal is to drastically decrease human oversight by implementing a self-correcting architecture that:
1.  **Self-Evaluates:** Uses an "LLM-as-a-Judge" loop to refine plans before execution.
2.  **Self-Configures:** Ingests entire API suites via OpenAPI specs to eliminate manual tool setup.
3.  **Self-Corrects:** Employs a "Reflexion" phase to observe failures and re-route logic autonomously.

---

##  The Workflow

### Phase 1: Task Decomposition & The "Judge" Loop
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

### Phase 3: Contextual Memory & Observation (Reflexion Phase)
The agent uses a **Custom JSON Structure** as an internal workspace to maintain state without human help.

* **Reflexion Mechanism:** After every tool call, the agent "reflects" on the output, parsing JSON responses to extract only mission-critical variables (e.g., `status_code`, `auth_token`).
* **Autonomous Recovery:** By maintaining this clean "scratchpad," the agent can detect if a tool call failed or if retrieved data requires a change in the original plan. It can then re-route its logic without asking the user "What should I do next?"

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Inference (Planning)** | **Groq** (Llama 3 / 70B) |
| **Reasoning (Evaluation)** | **Gemini Flash 2.0** |
| **Testing Framework** | **DeepEval** (Answer Relevancy) |
| **Orchestration** | **LangChain** |
| **State Management** | **Custom JSON Structure** |
| **Tooling Protocols** | **OpenAPI (Swagger)** |
| **Search Intelligence** | **Tavily API** |

---

## Impact: Minimizing Intervention
By moving the "logic check" from the human to the **Gemini-powered Judge** and the "correction phase" to the **Reflexion module**, AutoDAG transforms the user from a "babysitter" into a "supervisor." The agent handles the messy middle of task execution, only returning to the human once the objective is met.

---
