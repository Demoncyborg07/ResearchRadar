from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import requests
import os
import re


# ----------------------------
# LATEX CLEANER
# ----------------------------

def clean_latex(text):
    """Convert any remaining LaTeX notation to readable plain text."""

    # Remove display math blocks: \[ ... \] and $$ ... $$
    text = re.sub(r'\\\[(.+?)\\\]', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'\$\$(.+?)\$\$', r'\1', text, flags=re.DOTALL)

    # Remove inline math delimiters: $...$
    text = re.sub(r'\$([^$]+?)\$', r'\1', text)

    # \mathbf{X} → X,  \textbf{X} → X,  \mathrm{X} → X, etc.
    text = re.sub(r'\\(?:mathbf|textbf|mathbb|mathrm|mathcal|boldsymbol|text|operatorname)\{([^}]*)\}', r'\1', text)

    # \frac{a}{b} → (a/b)
    text = re.sub(r'\\frac\{([^}]*)\}\{([^}]*)\}', r'(\1/\2)', text)

    # \sqrt{x} → √(x)
    text = re.sub(r'\\sqrt\{([^}]*)\}', r'√(\1)', text)

    # Superscripts: ^{2} → ², ^{3} → ³, ^{n} → ^n, x^2 → x²
    sup_map = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
               '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
               'n': 'ⁿ', 'i': 'ⁱ', '-': '⁻', '+': '⁺'}

    def replace_sup(m):
        content = m.group(1)
        result = ''.join(sup_map.get(c, f'^{c}') for c in content)
        return result

    text = re.sub(r'\^\{([^}]*)\}', replace_sup, text)
    # Single char superscript: ^2 → ²
    text = re.sub(r'\^(\d)', lambda m: sup_map.get(m.group(1), '^' + m.group(1)), text)

    # Subscripts: _{n} → _n (keep simple)
    text = re.sub(r'_\{([^}]*)\}', r'_\1', text)

    # Greek letters
    greek = {
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
        'epsilon': 'ε', 'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η',
        'theta': 'θ', 'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ',
        'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ',
        'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ',
        'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
        'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ',
        'Xi': 'Ξ', 'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ',
        'Psi': 'Ψ', 'Omega': 'Ω', 'infty': '∞', 'partial': '∂',
        'nabla': '∇', 'sum': 'Σ', 'prod': 'Π', 'int': '∫',
    }
    for cmd, symbol in greek.items():
        text = text.replace(f'\\{cmd}', symbol)

    # Common operators
    text = text.replace('\\cdot', '·')
    text = text.replace('\\times', '×')
    text = text.replace('\\pm', '±')
    text = text.replace('\\leq', '≤').replace('\\le', '≤')
    text = text.replace('\\geq', '≥').replace('\\ge', '≥')
    text = text.replace('\\neq', '≠').replace('\\ne', '≠')
    text = text.replace('\\approx', '≈')
    text = text.replace('\\equiv', '≡')
    text = text.replace('\\in', '∈')
    text = text.replace('\\subset', '⊂')
    text = text.replace('\\rightarrow', '→').replace('\\to', '→')
    text = text.replace('\\leftarrow', '←')
    text = text.replace('\\Rightarrow', '⇒')
    text = text.replace('\\forall', '∀')
    text = text.replace('\\exists', '∃')
    text = text.replace('\\ldots', '…').replace('\\dots', '…')
    text = text.replace('\\langle', '⟨').replace('\\rangle', '⟩')
    text = text.replace('\\left', '').replace('\\right', '')
    text = text.replace('\\|', '‖')
    text = text.replace('\\,', ' ').replace('\\;', ' ').replace('\\!', '')
    text = text.replace('\\quad', '  ').replace('\\qquad', '    ')

    # Clean up remaining \command patterns (remove backslash)
    text = re.sub(r'\\([a-zA-Z]+)', r'\1', text)

    # Clean up stray braces
    text = text.replace('{', '').replace('}', '')

    return text


def strip_references(text):
    """Remove the References / Bibliography section from extracted PDF text."""
    pattern = re.compile(
        r'(?m)^\s*(?:References|Bibliography|Works\s+Cited)\s*$',
        re.IGNORECASE
    )
    match = pattern.search(text)
    if match:
        return text[:match.start()].rstrip()
    return text


def clean_output(text):
    """Fix common LLM formatting quirks."""
    # Convert 'item:' markers to proper bullet points
    text = re.sub(r'(?m)^[ \t]*item:\s*', '- ', text)
    # Also handle '- item:' patterns
    text = re.sub(r'(?m)^[ \t]*-\s*item:\s*', '- ', text)
    return text

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL_NAME = "llama-3.1-8b-instant"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# DATA MODELS
# ----------------------------

class Paper(BaseModel):
    title: str
    abstract: str


class PDFRequest(BaseModel):
    text: str
    type: str


# ----------------------------
# ARXIV ANALYSIS
# ----------------------------

@app.post("/analyze")
def analyze_paper(paper: Paper):

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    system_msg = (
        "You are a research expert. "
        "FORMATTING RULES (follow strictly): "
        "1) Each section heading must be bold and numbered like: **1. Title:** then a blank line, then the content. "
        "2) Always put a blank line before each new section heading. "
        "3) Use bullet points (- item) for lists, each on its own line. "
        "4) Write all math in plain text with Unicode (sin(W·x + b), x², √n). NEVER use LaTeX or $ signs. "
        "5) Keep paragraphs short and separated by blank lines."
    )

    prompt = f"""
Title:
{paper.title}

Abstract:
{paper.abstract}

Provide the following analysis. Use the EXACT format shown:

**1. Main Contribution:**
(explain here)

**2. Methodology Explanation:**
(explain here)

**3. Key Findings:**
(list here)

**4. Limitations:**
(list here)

**5. Related Research Direction:**
(explain here)

**6. Related Works:**
(list paper name and URL for each)
"""

    response = requests.post(
        GROQ_URL,
        headers=headers,
        json={
            "model": MODEL_NAME,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ]
        }
    )

    result = response.json()

    if "choices" not in result:
        error_msg = result.get("error", {}).get("message", str(result))
        return JSONResponse(status_code=502, content={"error": f"Groq API error: {error_msg}"})

    analysis = result["choices"][0]["message"]["content"]
    analysis = clean_latex(analysis)

    return {"analysis": analysis}
# ----------------------------
# PDF ANALYSIS
# ----------------------------

@app.post("/analyze_pdf")
def analyze_pdf(pdf: PDFRequest):

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    if pdf.type == "research":
        paper_text = strip_references(pdf.text[:12000])

        prompt = f"""
This document is a research paper.

Extract and explain each of the following. Use the EXACT format shown:

**1. Abstract:**
(summarize here)

**2. Methodology:**
(explain here)

**3. Dataset used:**
(describe here)

**4. Model or algorithm:**
(explain here)

**5. Workflow:**
(describe steps here)

**6. Results:**
(summarize here)

**7. Limitations:**
(list here)

Paper:
{paper_text}
"""

    else:

        prompt = f"""
This is a normal document.

Provide a structured detailed summary. Use the EXACT format shown:

**1. Document Summary:**
(overall summary here)

**2. Key Topics:**
(list main topics covered)

**3. Important Points:**
(list key points as bullet items)

**4. Conclusion:**
(summarize the takeaway)

Document:
{pdf.text[:12000]}
"""

    system_msg = (
        "FORMATTING RULES (follow strictly): "
        "1) Each section heading must be bold and numbered like: **1. Title:** then a blank line, then the content. "
        "2) Always put a blank line before each new section heading. "
        "3) Use bullet points (- item) for lists, each on its own line. "
        "4) Write all math in plain text with Unicode (sin(W·x + b), x², √n). NEVER use LaTeX or $ signs. "
        "5) Keep paragraphs short and separated by blank lines."
    )

    response = requests.post(
        GROQ_URL,
        headers=headers,
        json={
            "model": MODEL_NAME,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ]
        }
    )

    result = response.json()

    if "choices" not in result:
        error_msg = result.get("error", {}).get("message", str(result))
        return JSONResponse(status_code=502, content={"error": f"Groq API error: {error_msg}"})

    analysis = result["choices"][0]["message"]["content"]
    analysis = clean_latex(analysis)

    return {"analysis": analysis}