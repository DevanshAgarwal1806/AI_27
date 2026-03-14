import os
import json
import yaml
from langchain_community.agent_toolkits.openapi.toolkit import OpenAPIToolkit
from langchain_community.utilities.requests import RequestsWrapper
from langchain_community.tools.json.tool import JsonSpec
from langchain_google_genai import ChatGoogleGenerativeAI

def get_openapi_tools():
    """
    Reads an OpenAPI/Swagger spec from data/openapi_specs/ 
    and dynamically generates tools (GET, POST, JSON Explorer) for the agent.
    """
    specs_dir = os.path.join(os.getcwd(), "data", "openapi_specs")
    
    if not os.path.exists(specs_dir):
        return []

    # Find the first valid JSON or YAML file
    spec_files = [f for f in os.listdir(specs_dir) if f.endswith(('.json', '.yaml', '.yml'))]
    
    if not spec_files:
        print("No OpenAPI specs found in data/openapi_specs/. Skipping.")
        return []

    primary_spec_file = spec_files[0]
    filepath = os.path.join(specs_dir, primary_spec_file)
    
    try:
        # 1. Initialize the LLM "Brain" to read the docs
        # Gemini is perfect here because of its massive context window
        llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)
        
        # 2. Initialize the wrapper that actually makes the HTTP requests
        requests_wrapper = RequestsWrapper()
        
        # 3. Parse the file
        with open(filepath, "r", encoding="utf-8") as f:
            if primary_spec_file.endswith(".json"):
                raw_spec = json.load(f)
            else:
                raw_spec = yaml.safe_load(f)
                
        # 4. Convert to LangChain's JsonSpec format
        json_spec = JsonSpec(dict_=raw_spec, max_value_length=4000)
        
        # 5. Dynamically Generate the Tools
        toolkit = OpenAPIToolkit.from_llm(
            llm=llm,
            json_spec=json_spec,
            requests_wrapper=requests_wrapper,
            allow_dangerous_requests=True # Critical: Allows the agent to make live POST/GET requests
        )
        
        print(f"Dynamically generated OpenAPI tools from: {primary_spec_file}")
        return toolkit.get_tools()
        
    except Exception as e:
        print(f"Failed to parse OpenAPI spec {primary_spec_file}: {e}")
        return []