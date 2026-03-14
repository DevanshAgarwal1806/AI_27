import os
import wikipedia
from langchain_core.tools import tool

from langchain_community.utilities.wikipedia import WikipediaAPIWrapper
from langchain_community.tools.wikipedia.tool import WikipediaQueryRun
from langchain_community.document_loaders import WikipediaLoader

from langchain_community.utilities.arxiv import ArxivAPIWrapper
from langchain_community.tools.arxiv.tool import ArxivQueryRun
from langchain_community.document_loaders import ArxivLoader

from langchain_community.agent_toolkits.github.toolkit import GitHubToolkit
from langchain_community.utilities.github import GitHubAPIWrapper

@tool
def wikipedia_full_read_tool(page_title: str) -> str:
    """
    Use this tool to read the FULL, un-truncated text of a Wikipedia article.
    Use this when you need deep, specific details, history, or facts from the page.
    Input should be the exact title of the Wikipedia page (e.g., 'Quantum computing').
    """
    try:
        # load_max_docs=1 ensures we only get the exact page requested
        loader = WikipediaLoader(query=page_title, load_max_docs=1)
        docs = loader.load()
        if docs:
            return docs[0].page_content
        return "Article not found. Try a different search term."
    except Exception as e:
        return f"Error loading full Wikipedia page: {e}"

@tool
def arxiv_full_read_tool(paper_id: str) -> str:
    """
    Use this tool to read the FULL text of an Arxiv paper. 
    Only use this AFTER you have found a specific paper ID using the search tool.
    Input should be the exact Arxiv ID (e.g., '1605.08386').
    """
    try:
        loader = ArxivLoader(query=paper_id, load_max_docs=1)
        docs = loader.load()
        if docs:
            return docs[0].page_content
        return "Paper not found."
    except Exception as e:
        return f"Error loading full paper: {e}"

def get_research_tools():
    """Returns a list of tools for academic and general research (Skimmers + Deep Readers)."""
    # We pass wiki_client=wikipedia to bypass the Pydantic validation bug
    wiki_wrapper = WikipediaAPIWrapper(wiki_client=wikipedia, top_k_results=3, doc_content_chars_max=2000)
    wiki_search_tool = WikipediaQueryRun(
        api_wrapper=wiki_wrapper,
        description="Search Wikipedia for summaries and page titles. Use this FIRST to find the exact page title."
    )
    
    arxiv_wrapper = ArxivAPIWrapper(top_k_results=3, doc_content_chars_max=2000)
    arxiv_search_tool = ArxivQueryRun(
        api_wrapper=arxiv_wrapper,
        description="Search Arxiv for abstracts and Paper IDs. Use this FIRST to find relevant paper IDs."
    )
    
    # Return both the skimmers and our custom deep readers
    return [
        wiki_search_tool, 
        wikipedia_full_read_tool, 
        arxiv_search_tool, 
        arxiv_full_read_tool
    ]