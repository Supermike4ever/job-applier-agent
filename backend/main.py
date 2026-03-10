"""
SmartApply AI - Backend API Server
===================================
FastAPI 后端，连接 Amazon Nova 2 Lite (via Bedrock) 提供：
1. 简历解析 → 结构化 JSON
2. JD 分析 + 匹配评分
3. Cover Letter 生成

运行方式:
  pip install fastapi uvicorn boto3 python-multipart pdfplumber
  uvicorn main:app --reload --port 8000
"""

import json
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import boto3

# ================================================================
# App Setup
# ================================================================
app = FastAPI(title="SmartApply AI API", version="1.0.0")

# CORS - 允许 Chrome 插件跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境请限制为你的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================================================
# Amazon Bedrock Client (Nova 2 Lite)
# ================================================================
# 确保已配置 AWS credentials:
#   export AWS_ACCESS_KEY_ID=xxx
#   export AWS_SECRET_ACCESS_KEY=xxx
#   export AWS_DEFAULT_REGION=us-east-1

bedrock = boto3.client(
    service_name="bedrock-runtime",
    region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
)

MODEL_ID = "us.amazon.nova-lite-v1:0"  # Nova 2 Lite model ID


def call_nova(prompt: str, max_tokens: int = 2000) -> str:
    """调用 Nova 2 Lite 模型"""
    try:
        response = bedrock.converse(
            modelId=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ],
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": 0.3,
            },
        )
        return response["output"]["message"]["content"][0]["text"]
    except Exception as e:
        print(f"[Nova Error] {e}")
        raise e


# ================================================================
# API 1: 简历解析
# ================================================================
@app.post("/api/parse-resume")
async def parse_resume(resume: UploadFile = File(...)):
    """
    上传简历 PDF → Nova 2 Lite 解析 → 返回结构化 JSON
    """
    # 读取 PDF 文本
    import pdfplumber

    content = await resume.read()

    # 保存临时文件
    temp_path = f"/tmp/{resume.filename}"
    with open(temp_path, "wb") as f:
        f.write(content)

    # 提取文本
    text = ""
    with pdfplumber.open(temp_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    # 清理临时文件
    os.remove(temp_path)

    if not text.strip():
        return {"error": "Could not extract text from PDF"}

    # 用 Nova 2 Lite 解析
    prompt = f"""You are a resume parser. Extract the following information from this resume and return it as a JSON object.

Required fields:
- first_name (string)
- last_name (string) 
- email (string)
- phone (string)
- location (string, city + state/country)
- linkedin (string, URL if present)
- portfolio (string, GitHub/website URL if present)
- skills (array of strings)
- experience_years (number, estimated total)
- experiences (array of objects with: company, title, duration, description)
- education (array of objects with: school, degree, field, year)
- summary (string, 2-3 sentence professional summary)

Return ONLY valid JSON, no markdown, no explanation.

Resume text:
{text[:4000]}"""

    result = call_nova(prompt)

    # 解析 JSON
    try:
        # 清理可能的 markdown 包裹
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        parsed = json.loads(cleaned)
        return parsed
    except json.JSONDecodeError:
        return {
            "error": "Failed to parse Nova response as JSON",
            "raw_response": result[:500],
        }


# ================================================================
# API 2: JD 分析 + 匹配评分
# ================================================================
class MatchRequest(BaseModel):
    jd_text: str
    resume_data: Optional[dict] = None


@app.post("/api/analyze-match")
async def analyze_match(req: MatchRequest):
    """
    分析 JD + 简历匹配度，返回评分和关键词
    """
    resume_summary = json.dumps(req.resume_data, indent=2) if req.resume_data else "No resume data"

    prompt = f"""You are a job matching analyst. Analyze the match between this resume and job description.

Return a JSON object with:
- score (number 0-100, match percentage)
- strengths (string, 2-3 key strengths that match the JD)
- gaps (string, 2-3 key gaps or missing qualifications)
- keywords (object with two arrays):
  - matched: keywords from JD that the resume covers
  - missing: keywords from JD that the resume lacks
- recommendation (string, brief advice on whether to apply and how to strengthen the application)

Be honest and specific. Return ONLY valid JSON.

Job Description:
{req.jd_text[:3000]}

Resume Data:
{resume_summary[:2000]}"""

    result = call_nova(prompt)

    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "score": 0,
            "strengths": "Analysis failed",
            "gaps": "Please try again",
            "keywords": {"matched": [], "missing": []},
            "raw_response": result[:500],
        }


# ================================================================
# API 3: Cover Letter 生成
# ================================================================
class CoverLetterRequest(BaseModel):
    jd_text: str
    resume_data: Optional[dict] = None
    profile: Optional[dict] = None


@app.post("/api/generate-cover-letter")
async def generate_cover_letter(req: CoverLetterRequest):
    """
    根据 JD + 简历生成定制 Cover Letter
    """
    resume_summary = json.dumps(req.resume_data, indent=2) if req.resume_data else "No resume data"
    profile_info = json.dumps(req.profile, indent=2) if req.profile else ""

    prompt = f"""You are an expert career advisor. Write a professional, compelling cover letter for this specific job posting.

Requirements:
1. Tailor it specifically to the job description - mention the company name and role
2. Highlight relevant skills and experiences from the resume that match the JD
3. Address potential gaps positively (show willingness to learn)
4. Keep it concise: 3-4 paragraphs, under 300 words
5. Use a professional but warm tone - avoid generic phrases like "I am writing to express my interest"
6. Include specific examples from the resume that demonstrate relevant skills
7. End with a clear call to action

Also extract the top 8-10 keywords from the JD that are most important for ATS optimization.

Return a JSON object with:
- cover_letter (string, the full cover letter text)
- keywords (array of strings, top JD keywords)

Return ONLY valid JSON.

Job Description:
{req.jd_text[:3000]}

Resume:
{resume_summary[:2000]}

Profile:
{profile_info[:500]}"""

    result = call_nova(prompt, max_tokens=3000)

    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "cover_letter": result,
            "keywords": [],
        }


# ================================================================
# Health Check
# ================================================================
@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_ID}


# ================================================================
# 运行
# ================================================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
