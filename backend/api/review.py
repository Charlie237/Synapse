"""AI photo review endpoint."""
import base64
import os
from fastapi import APIRouter, HTTPException, Request
from core import settings
from db.queries import get_image_by_id

router = APIRouter()


@router.post("/images/{image_id}/review")
async def review_image(image_id: int, request: Request):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")

    api_key = settings.get("vision_api_key") or settings.get("openai_api_key")
    if not api_key:
        raise HTTPException(400, "API key not configured")

    # Use thumbnail for smaller payload
    thumb = img.get("thumbnail") or img["file_path"]
    if not os.path.exists(thumb):
        raise HTTPException(404, "Image file not found")

    with open(thumb, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    ext = thumb.rsplit(".", 1)[-1].lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")

    try:
        from openai import OpenAI
        base_url = settings.get("vision_base_url") or settings.get("openai_base_url") or None
        model = settings.get("vision_model") or "gpt-4o"
        client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

        resp = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "你是一位专业摄影评论家。请用中文简短点评这张照片的构图、光线、色彩和整体感觉，给出1-2句改进建议，最后给一个1-10的评分。控制在100字以内。"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            }],
            max_tokens=200,
        )
        review = resp.choices[0].message.content
        return {"review": review}
    except Exception as e:
        raise HTTPException(500, str(e))
