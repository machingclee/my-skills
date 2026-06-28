import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

app = FastAPI()

# Configure CORS — list every origin allowed to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",          # TODO: your frontend origin(s)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", summary="Health check")
async def root():
    return {"message": f"Hello from {os.getenv('APP_NAME', 'FastAPI on Lambda')}"}


@app.get("/stream", summary="Minimal NDJSON streaming example")
async def stream():
    """HTTP chunked transfer (NOT SSE / WebSocket).

    Each `yield` flushes one JSON line. Streams fine on local uvicorn. Through
    the API Gateway in serverless.yml the response is BUFFERED (no real
    streaming) — see the skill's SKILL.md "Streaming gotcha" to stream for real
    from Lambda (Function URL + InvokeMode: RESPONSE_STREAM).
    """

    async def generate():
        for word in ["hello", "from", "lambda"]:
            yield json.dumps({"type": "token", "data": word}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
