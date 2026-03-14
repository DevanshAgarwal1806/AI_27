import os
from langchain_tavily import TavilySearch

def get_search_tool():
    """
    Initializes the Tavily Search tool for agent-optimized web intelligence.
    The LLM will use this when it needs to find real-time, up-to-date information.
    """
    # max_results limits the output so we don't overwhelm the agent's memory
    search_tool = TavilySearch(max_results=10, api_key=os.getenv("TAVILY_API_KEY"))
    
    return [search_tool]