"""Document parser for CVs and Resumes supporting PDF, DOCX, and OCR fallback."""
import io
import logging
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional

from fastapi import HTTPException, status
from pypdf import PdfReader

logger = logging.getLogger(__name__)

# Check for python-docx
try:
    import docx
    HAS_DOCX = True
except ImportError:
    docx = None
    HAS_DOCX = False

# Check for pytesseract
try:
    import pytesseract
    from PIL import Image
    HAS_PYTESSERACT = True
except ImportError:
    pytesseract = None
    Image = None
    HAS_PYTESSERACT = False


def extract_text_from_docx(docx_bytes: bytes) -> str:
    """Extract readable text from a DOCX byte stream using python-docx with XML fallback."""
    if not docx_bytes or len(docx_bytes) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded DOCX file is empty or corrupted.",
        )

    # 1. Primary extraction via python-docx
    if HAS_DOCX and docx is not None:
        try:
            doc = docx.Document(io.BytesIO(docx_bytes))
            chunks: list[str] = []
            for p in doc.paragraphs:
                txt = p.text.strip()
                if txt:
                    chunks.append(txt)

            for table in doc.tables:
                for row in table.rows:
                    row_txt = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_txt:
                        chunks.append(row_txt)

            full_text = "\n\n".join(chunks).strip()
            if full_text:
                return re.sub(r"\n{3,}", "\n\n", full_text)
        except Exception as exc:
            logger.warning("python-docx extraction failed, trying XML fallback: %s", exc)

    # 2. Fallback: Parse word/document.xml directly from docx ZIP container
    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
            if "word/document.xml" in z.namelist():
                xml_content = z.read("word/document.xml")
                root = ET.fromstring(xml_content)
                namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                texts: list[str] = []
                for p_node in root.findall(".//w:p", namespaces):
                    p_texts = [t.text for t in p_node.findall(".//w:t", namespaces) if t.text]
                    if p_texts:
                        texts.append("".join(p_texts).strip())
                full_text = "\n\n".join(texts).strip()
                if full_text:
                    return re.sub(r"\n{3,}", "\n\n", full_text)
    except Exception as exc:
        logger.warning("DOCX XML fallback extraction failed: %s", exc)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Could not extract text from DOCX document. Please verify the file is not corrupted.",
    )


def _ocr_fallback_for_pdf(reader: PdfReader, pdf_bytes: bytes) -> str:
    """
    OCR fallback for scanned (image-only) PDFs:
      1. Tesseract via pytesseract if available.
      2. Direct page text stream and image object extraction.
    """
    # 1. Try pytesseract OCR if image objects are extractable
    if HAS_PYTESSERACT and pytesseract is not None and Image is not None:
        try:
            ocr_chunks: list[str] = []
            for idx, page in enumerate(reader.pages[:4]):  # Scan first up to 4 pages
                for img_obj in page.images:
                    pil_img = Image.open(io.BytesIO(img_obj.data))
                    ocr_res = pytesseract.image_to_string(pil_img)
                    cleaned = ocr_res.strip()
                    if cleaned:
                        ocr_chunks.append(cleaned)
            full_ocr = "\n\n".join(ocr_chunks).strip()
            if len(full_ocr) > 30:
                logger.info("Successfully extracted %d chars via pytesseract OCR", len(full_ocr))
                return re.sub(r"\n{3,}", "\n\n", full_ocr)
        except Exception as exc:
            logger.warning("pytesseract OCR fallback failed: %s", exc)

    # 2. Extract any embedded raw text streams or fonts
    raw_text_chunks: list[str] = []
    for page in reader.pages:
        try:
            extracted = page.extract_text(extraction_mode="layout") or page.extract_text() or ""
            if extracted.strip():
                raw_text_chunks.append(extracted.strip())
        except Exception:
            continue

    if raw_text_chunks:
        return re.sub(r"\n{3,}", "\n\n", "\n\n".join(raw_text_chunks))

    # If document has pages but no readable text (pure scanned image)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="The uploaded PDF appears to be a scanned image without a readable text layer. Please upload a searchable PDF or DOCX format.",
    )


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract readable text from a PDF byte stream using pypdf with OCR fallback for scanned documents."""
    if not pdf_bytes or len(pdf_bytes) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded PDF file is empty or too small.",
        )

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse PDF document: {exc}",
        )

    if len(reader.pages) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF document contains no pages.",
        )

    extracted_pages: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
            cleaned = page_text.strip()
            if cleaned:
                extracted_pages.append(cleaned)
        except Exception:
            continue

    full_text = "\n\n".join(extracted_pages).strip()

    # If pypdf extracted minimal or empty text (< 40 chars), trigger OCR fallback
    if len(full_text) < 40:
        logger.info("PDF has minimal text (%d chars). Invoking OCR fallback.", len(full_text))
        return _ocr_fallback_for_pdf(reader, pdf_bytes)

    # Normalize excessive newlines
    return re.sub(r"\n{3,}", "\n\n", full_text)


def parse_cv_document(file_bytes: bytes, filename: str) -> str:
    """
    Unified entrypoint to parse candidate CV documents from bytes.
    Routes according to file extension or format (PDF vs DOCX).
    """
    lower = filename.lower()
    if lower.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    elif lower.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif lower.endswith(".txt") or lower.endswith(".md"):
        try:
            return file_bytes.decode("utf-8").strip()
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1").strip()
    else:
        # Default try PDF first, then DOCX
        try:
            return extract_text_from_pdf(file_bytes)
        except Exception:
            return extract_text_from_docx(file_bytes)
