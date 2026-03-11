from __future__ import annotations

import io
from pathlib import Path

from docx import Document
from pypdf import PdfReader


class UnsupportedFileTypeError(ValueError):
    pass


def extract_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower().lstrip(".")
    if suffix == "pdf":
        return _extract_pdf(content)
    if suffix in {"docx", "doc"}:
        return _extract_docx(content)
    raise UnsupportedFileTypeError(f"Unsupported file type: .{suffix or '(none)'}")


def _extract_pdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    parts: list[str] = []
    for page in reader.pages:
        txt = page.extract_text() or ""
        parts.append(txt)
    return "\n".join(p.strip() for p in parts if p.strip()).strip()


def _extract_docx(content: bytes) -> str:
    doc = Document(io.BytesIO(content))
    parts: list[str] = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text.strip())
    return "\n".join(parts).strip()

