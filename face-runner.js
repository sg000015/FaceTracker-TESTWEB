// face-runner.js (ESM)
// MediaPipe FaceLandmarker를 CPU 모드로 돌리고,
// 얼굴 중심 이동값을 Unity로 전달(unityInstance.SendMessage)

window.__FaceTracker = {
    _state: {
        stream: null,
        rafId: 0,
        landmarker: null,
        video: null,
    },

    async start(
        gameObjectName = "FaceReceiver",
        methodName = "OnFaceMove",
        sensitivity = 1.5
    ) {
        console.log("🎥 FaceTracker: init");

        // HTTPS 권장 (localhost 예외)
        if (
            location.protocol !== "https:" &&
            location.hostname !== "localhost"
        ) {
            console.warn("FaceTracker: HTTPS 권장 (카메라 권한 문제 가능)");
        }

        // 1) 비디오 생성
        const video = document.createElement("video");
        Object.assign(video, {
            autoplay: true,
            playsInline: true,
            muted: true,
        });
        video.style.display = "none";
        document.body.appendChild(video);

        // 2) 카메라 접근
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            });
        } catch (e) {
            console.error("getUserMedia failed:", e);
            alert("카메라 권한을 허용해주세요.");
            return;
        }
        video.srcObject = stream;
        await new Promise((r) => (video.onloadedmetadata = r));

        // 3) MediaPipe 로드 (CPU delegate로 WebGL 충돌 회피)
        const { FaceLandmarker, FilesetResolver } = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.7"
        );
        const resolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.7/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(resolver, {
            baseOptions: {
                delegate: "CPU", // ⭐️ Unity WebGL과 충돌 방지 핵심
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.2,
            minFacePresenceConfidence: 0.2,
            minTrackingConfidence: 0.2,
        });

        console.log("✅ FaceTracker: model ready");

        // 내부 상태 저장
        this._state.stream = stream;
        this._state.landmarker = landmarker;
        this._state.video = video;

        // 4) 루프
        let prevX = 0.5,
            prevY = 0.5;

        const loop = async () => {
            if (video.readyState < 2) {
                requestAnimationFrame(loop);
                return;
            }

            // ⬇️ 추가 부분
            if (video.paused) {
                console.warn(
                    "⚠️ Video is paused — trying to resume playback..."
                );
                try {
                    await video.play();
                    console.log("▶️ Video playback resumed");
                } catch (e) {
                    console.error("❌ Failed to resume video:", e);
                }
                requestAnimationFrame(loop);
                return;
            }

            // 안정적인 타임스탬프
            const now = performance.now();
            let res;
            try {
                res = await landmarker.detectForVideo(video, now);
            } catch (e) {
                // 탭 전환/일시적 이슈 등
                // console.warn("detectForVideo error:", e);
                this._state.rafId = requestAnimationFrame(loop);
                return;
            }

            if (res && res.faceLandmarks && res.faceLandmarks.length > 0) {
                // console.log("✅ Face detected!");

                const lm = res.faceLandmarks[0];
                const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
                const cy = lm.reduce((s, p) => s + p.y, 0) / lm.length;

                // 중앙(0.5,0.5) 기준 상대이동 (+감도)
                const dx = (cx - 0.5) * sensitivity;
                const dy = (cy - 0.5) * sensitivity;

                // 소진동 필터
                if (
                    Math.abs(dx - prevX) > 0.01 ||
                    Math.abs(dy - prevY) > 0.01
                ) {
                    prevX = dx;
                    prevY = dy;

                    // Unity로 전송
                    const send = window.unityInstance?.SendMessage;
                    if (typeof send === "function") {
                        send(
                            gameObjectName,
                            methodName,
                            JSON.stringify({ x: dx, y: dy })
                        );
                    }
                }
            }

            this._state.rafId = requestAnimationFrame(loop);
        };

        // 탭 비활성화 후 복귀 시 루프 재개
        document.addEventListener("visibilitychange", () => {
            if (
                !document.hidden &&
                this._state.landmarker &&
                !this._state.rafId
            ) {
                this._state.rafId = requestAnimationFrame(loop);
            }
        });

        // 시작
        this._state.rafId = requestAnimationFrame(loop);
    },

    stop() {
        try {
            if (this._state.rafId) cancelAnimationFrame(this._state.rafId);
            this._state.rafId = 0;
            this._state.landmarker?.close?.();
            this._state.landmarker = null;
            if (this._state.stream) {
                this._state.stream.getTracks().forEach((t) => t.stop());
                this._state.stream = null;
            }
            if (this._state.video) {
                this._state.video.srcObject = null;
                this._state.video.remove();
                this._state.video = null;
            }
            console.log("🛑 FaceTracker stopped");
        } catch (e) {
            console.warn("FaceTracker.stop error:", e);
        }
    },
};
