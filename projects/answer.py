from __future__ import annotations

import os
import json

import requests

from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI
from pydantic import BaseModel, Field

from ..core.openai_parse import parse_text
from ..core.types import Chunk
from .context import build_context
from .formatting import force_one_paragraph, format_specking_output


class SpeckingAnswer(BaseModel):
    paragraph: str = Field(
        description=(
            "Write as a short friendly spoken assistant in one natural paragraph. "
            "Stay technical and precise. State ONLY requirements/dimensions that appear verbatim in the retrieved chunks."
            "End with 1–2 targeted follow-up questions."
        )
    )


ANSWER_SYSTEM_PROMPT = (
    "You are a code-accurate built-environment standards assistant grounded ONLY in the retrieved sources below. "
    "Never invent requirements, dimensions, thresholds, exceptions, or interpretations. "
    "If the needed value is not explicitly present in the retrieved chunks, say: Not found in retrieved sources."
    "Write as a short friendly spoken assistant in one natural paragraph. "
    "Stay technical and precise. State ONLY requirements/dimensions that appear verbatim in the retrieved chunks."
    "End with 1–2 targeted follow-up questions."
)


LLAMA_UI_LABEL = "Llama-3.1-8B-Instruct"

def _call_modal_llama_chat(*, endpoint: str, api_key: str, system: str, user: str, temperature: float) -> str:
    """Call a Modal-hosted OpenAI-compatible /v1/chat/completions endpoint and return assistant text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": LLAMA_UI_LABEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": float(temperature),
    }
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    try:
        return (data.get("choices") or [])[0].get("message", {}).get("content", "")
    except Exception:
        return str(data)

def _extract_json_paragraph(raw: str) -> str:
    """Best-effort extraction of {"paragraph": "..."} from a model response; falls back to raw text."""
    s = (raw or '').strip()
    # Strip markdown code fences if present
    if s.startswith('```'):
        s = '\n'.join([ln for ln in s.splitlines() if not ln.strip().startswith('```')]).strip()
    start = s.find('{')
    end = s.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(s[start:end+1])
            if isinstance(obj, dict) and 'paragraph' in obj:
                return str(obj.get('paragraph') or '').strip()
        except Exception:
            pass
    return s

def generate_answer(
    client: OpenAI,
    *,
    model: str,
    question: str,
    chunks: List[Chunk],
    temperature: float = 0.1,
) -> Tuple[str, str, str]:
    """
    Returns:
      - paragraph_only (string)
      - formatted_specking_output (string)  [markers + References]
      - context_string (string)  [chunk pack]
    """
    context = build_context(chunks)

    user = f"""Answer the user's question using ONLY the retrieved chunks.

User question:
{question}

*** Retrieved chunks:
{context}
"""
    if (model or "").strip() == LLAMA_UI_LABEL:
        endpoint = os.getenv("MODAL_LLAMA_CHAT_ENDPOINT", "").strip()
        api_key = os.getenv("MODAL_LLAMA_API_KEY", "").strip()
        if not endpoint or not api_key:
            raise RuntimeError("Missing HF Space secrets: MODAL_LLAMA_CHAT_ENDPOINT and/or MODAL_LLAMA_API_KEY")
        llama_system = (
            ANSWER_SYSTEM_PROMPT           
        )
        raw = _call_modal_llama_chat(
            endpoint=endpoint,
            api_key=api_key,
            system=llama_system,
            user=user,
            temperature=temperature,
        )
        paragraph = force_one_paragraph(_extract_json_paragraph(raw))
    else:
        parsed = parse_text(client, model=model, system=ANSWER_SYSTEM_PROMPT, user=user, schema=SpeckingAnswer, temperature=temperature)
        paragraph = force_one_paragraph(parsed.paragraph)
    formatted = format_specking_output(paragraph, chunks)
    return paragraph, formatted, context