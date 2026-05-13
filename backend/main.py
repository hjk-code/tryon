from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
import asyncio
import base64
import logging
from dotenv import load_dotenv
from asyncio import Lock
import cv2
import numpy as np
from PIL import Image, ImageEnhance

# Load environment variables
load_dotenv()

app = FastAPI()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment Variables
VTON_API_KEY = os.getenv("VTON_API_KEY")
API_URL = "https://api.fashn.ai/v1/run"

# 🔒 HARD LOCK (prevents duplicate API calls to manage rate limits)
lock = Lock()


@app.get("/api/health")
async def health_check():
    """Check if backend is running and API key is configured"""
    return {
        "status": "healthy",
        "api_key_configured": bool(VTON_API_KEY),
        "api_key_length": len(VTON_API_KEY) if VTON_API_KEY else 0
    }

# 🔥 IMAGE PREPROCESSING FOR BETTER GARMENT DETECTION
def enhance_garment_image(image_bytes: bytes) -> bytes:
    """
    Enhance garment image for better try-on results:
    - Increase contrast and color vibrancy
    - Sharpen edges for accurate segmentation
    - Optimize resolution for AI processing
    """
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return image_bytes
        
        # Convert to PIL for enhancement
        img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        # 1. Enhance Contrast (40% boost)
        img_pil = ImageEnhance.Contrast(img_pil).enhance(1.4)
        
        # 2. Enhance Color (30% boost)
        img_pil = ImageEnhance.Color(img_pil).enhance(1.3)
        
        # 3. Enhance Sharpness (60% boost)
        img_pil = ImageEnhance.Sharpness(img_pil).enhance(1.6)
        
        # Convert back to OpenCV
        img_enhanced = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
        
        # 4. Apply Unsharp Mask for edge definition
        gaussian = cv2.GaussianBlur(img_enhanced, (0, 0), 2.0)
        img_enhanced = cv2.addWeighted(img_enhanced, 1.5, gaussian, -0.5, 0)
        
        # 5. Resize if too large (max 1024px)
        height, width = img_enhanced.shape[:2]
        if height > 1024 or width > 1024:
            scale = min(1024 / height, 1024 / width)
            img_enhanced = cv2.resize(img_enhanced, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_CUBIC)
        
        success, encoded = cv2.imencode('.png', img_enhanced)
        return encoded.tobytes() if success else image_bytes
            
    except Exception as e:
        logger.error(f"❌ Error in image enhancement: {str(e)}")
        return image_bytes


@app.post("/api/generate-tryon")
async def generate_tryon(
    person_img: UploadFile = File(...),
    dress_url: str = Form(...),
    category: str = Form("one-pieces"),  # Kept for future compatibility / logging
):
    logger.info(f"📥 Received request - Person image: {person_img.filename}, Dress URL type: {dress_url[:30]}...")
    
    if lock.locked():
        logger.warning("Another request is already processing, returning 429.")
        raise HTTPException(status_code=429, detail="Another request is already processing. Please try again shortly.")

    async with lock:
        if not VTON_API_KEY:
            logger.error("VTON_API_KEY missing in .env")
            raise HTTPException(status_code=500, detail="VTON_API_KEY missing in .env")

        try:
            # 1. Process Person Image
            logger.info(f"Processing person image: {person_img.filename}")
            person_bytes = await person_img.read()
            logger.info(f"Person image size: {len(person_bytes)} bytes")
            person_b64 = base64.b64encode(person_bytes).decode("utf-8")
            person_data_uri = f"data:{person_img.content_type};base64,{person_b64}"

            # 2. Process Garment Image (Enhance if it's a data URL)
            product_image_url = dress_url
            if dress_url.startswith("data:"):
                logger.info("Processing garment as data URL")
                try:
                    header, encoded = dress_url.split(",", 1)
                    dress_bytes = base64.b64decode(encoded)
                    logger.info(f"Dress image size before enhancement: {len(dress_bytes)} bytes")
                    enhanced_bytes = enhance_garment_image(dress_bytes)
                    logger.info(f"Dress image size after enhancement: {len(enhanced_bytes)} bytes")
                    enhanced_b64 = base64.b64encode(enhanced_bytes).decode("utf-8")
                    product_image_url = f"data:image/png;base64,{enhanced_b64}"
                    logger.info("✅ Garment image enhanced")
                except Exception as e:
                    logger.error(f"❌ Error preprocessing garment: {str(e)}")
            else:
                logger.info(f"Using garment URL: {dress_url[:100]}")

            # 3. Prepare API Payload for tryon-max (Clean & Minimal)
            # Only model_image + product_image are required.
            # Optional prompt helps with full outfit replacement.
            inputs_payload = {
                "model_image": person_data_uri,
                "product_image": product_image_url,          # ← Critical change
                "prompt": (
                    "person wearing the complete full outfit naturally, "
                    "full body view if possible, realistic lighting, high detail, "
                    "accurate garment fit and fabric texture"
                )
            }

            # Optional: You can make prompt dynamic based on category in future
            if category == "one-pieces":
                logger.info("👗 Full outfit mode (one-pieces) - using optimized prompt for tryon-max")

            payload = {
                "model_name": "tryon-max",
                "inputs": inputs_payload
            }

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {VTON_API_KEY}"
            }

            # 4. Start Generation Request
            logger.info("🚀 Sending request to tryon-max...")
            logger.info(f"API URL: {API_URL}")
            logger.info(f"Payload: {payload}")
            
            try:
                response = requests.post(API_URL, json=payload, headers=headers, timeout=30)
            except requests.exceptions.RequestException as req_error:
                logger.error(f"❌ Request failed: {str(req_error)}")
                return {"error": "Failed to connect to fashn.ai API", "details": str(req_error)}
            
            res_data = response.json()

            if response.status_code != 200:
                logger.error(f"API Error Status {response.status_code}: {res_data}")
                return {"error": f"Fashn.ai returned status {response.status_code}", "details": res_data}

            prediction_id = res_data.get("id")
            if not prediction_id:
                logger.error(f"No prediction ID in response: {res_data}")
                return {"error": "No prediction ID returned", "details": res_data}

            # 5. Polling for Result
            status_url = f"https://api.fashn.ai/v1/status/{prediction_id}"
            logger.info(f"⏳ Generation started with ID: {prediction_id}")
            logger.info(f"Status URL: {status_url}")

            for attempt in range(25):  # Increased attempts slightly
                await asyncio.sleep(8 if attempt < 6 else 12)  # Better timing
                
                try:
                    status_res = requests.get(status_url, headers=headers, timeout=30)
                    status_data = status_res.json()
                except requests.exceptions.RequestException as req_error:
                    logger.error(f"❌ Status check failed: {str(req_error)}")
                    continue
                
                status = status_data.get("status")
                logger.info(f"Attempt {attempt+1}/25: Status = {status}")

                if status == "completed":
                    output = status_data.get("output", [])
                    if output:
                        logger.info("✅ Generation successful")
                        return {"image_url": output[0]}
                    logger.error(f"No output in completed response: {status_data}")
                    return {"error": "No output image", "details": status_data}

                if status == "failed":
                    error_msg = status_data.get("error", "Unknown error")
                    logger.error(f"❌ Generation failed: {error_msg}")
                    return {"error": "Generation failed", "details": status_data}

            logger.error(f"❌ Polling timeout after 25 attempts")
            return {"error": "Timeout: generation took too long"}

        except Exception as e:
            logger.error(f"💥 Backend Error: {str(e)}")
            return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)