import os
import json
import yaml
from langchain_community.agent_toolkits.openapi.toolkit import OpenAPIToolkit
from langchain_community.utilities.requests import RequestsWrapper
from langchain_community.tools.json.tool import JsonSpec

# 1. Import the Groq Chat Model instead of Gemini
from langchain_groq import ChatGroq

def get_openapi_tools():
    """
    Reads an OpenAPI/Swagger spec from data/openapi_specs/ 
    and dynamically generates tools (GET, POST, JSON Explorer) using Groq.
    """
    specs_dir = os.path.join(os.getcwd(), "data", "openapi_specs")
    
    if not os.path.exists(specs_dir):
        return []

    # Find the first valid JSON or YAML file
    spec_files = [f for f in os.listdir(specs_dir) if f.endswith(('.json', '.yaml', '.yml'))]
    
    if not spec_files:
        print("No OpenAPI specs found in data/openapi_specs/. Skipping.")
        return []

    for file in spec_files:
        filepath = os.path.join(specs_dir, file)
        
        try:
            # 2. Initialize the Groq LLM "Brain"
            # We use a 70B model here because reading complex JSON schemas requires high reasoning
            llm = ChatGroq(
                model="llama3-70b-8192", 
                temperature=0,
                api_key=os.getenv("GROQ_API_KEY_OPENAPI")
            )
            
            requests_wrapper = RequestsWrapper()
            
            with open(filepath, "r", encoding="utf-8") as f:
                if file.endswith(".json"):
                    raw_spec = json.load(f)
                else:
                    raw_spec = yaml.safe_load(f)
                    
            json_spec = JsonSpec(dict_=raw_spec, max_value_length=4000)
            
            toolkit = OpenAPIToolkit.from_llm(
                llm=llm,
                json_spec=json_spec,
                requests_wrapper=requests_wrapper,
                allow_dangerous_requests=True # Allows the agent to make live POST/GET requests
            )
            
            print(f"Dynamically generated OpenAPI tools from: {file} (Powered by Groq)")
            return toolkit.get_tools()
            
        except Exception as e:
            print(f"Failed to parse OpenAPI spec {file}: {e}")
            return []