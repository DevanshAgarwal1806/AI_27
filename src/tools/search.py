import os
from langchain_tavily import TavilySearch

def get_search_tools():
    """
    Initializes the Tavily Search tool for agent-optimized web intelligence.
    The LLM will use this when it needs to find real-time, up-to-date information.
    
    Make sure TAVILY_API_KEY is set in your .env file.
    """
    # max_results limits the output so we don't overwhelm the agent's memory
    search_tool = TavilySearch(max_results=3)
    
    return [search_tool]