// face-runner.js
// Unity WebGL 얼굴 중심 추적 (안정 버전)
navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
        console.log("✅ Camera stream OK:", stream);
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        document.body.appendChild(video);
    })
    .catch((err) => console.error("❌ Camera error:", err));

window.__FaceTracker = {
    start: async function (
        gameObjectName = "FaceReceiver",
        methodName = "OnFaceMove",
        sensitivity = 1.5
    ) {
        console.log("🎥 FaceTracker initializing...");

        // ✅ HTTPS 확인 (모바일에서 필수)
        if (
            location.protocol !== "https:" &&
            location.hostname !== "localhost"
        ) {
            alert("⚠️ 카메라 사용을 위해 HTTPS 연결이 필요합니다.");
            return;
        }

        // ✅ 카메라 접근
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
        } catch (err) {
            console.error("❌ getUserMedia 실패:", err);
            alert("카메라 권한을 허용해주세요.");
            return;
        }

        // ✅ 비디오 엘리먼트 생성
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.display = "none";
        video.srcObject = stream;
        document.body.appendChild(video);

        await new Promise((res) => (video.onloadedmetadata = res));
        console.log(
            "📸 Video stream ready:",
            video.videoWidth,
            "x",
            video.videoHeight
        );

        // ✅ 캔버스 설정 (입력 다운샘플)
        const maxSize = 320;
        const scale = maxSize / Math.max(video.videoWidth, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // ✅ MediaPipe FaceLandmarker 로드
        const { FaceLandmarker, FilesetResolver } = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
        );
        const resolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(resolver, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
            },
            runningMode: "VIDEO",
            numFaces: 1,
        });
        console.log("✅ FaceLandmarker loaded.");

        // ✅ 안전한 SendMessage 헬퍼
        function safeSend(obj, method, payload, retries = 30) {
            const send =
                window.SendMessage || window.unityInstance?.SendMessage;
            if (typeof send === "function") {
                send(obj, method, payload);
            } else if (retries > 0) {
                setTimeout(
                    () => safeSend(obj, method, payload, retries - 1),
                    200
                );
            } else {
                console.warn("⚠️ Unity SendMessage not ready.");
            }
        }

        // ✅ 중심 계산 변수
        let prevX = 0.5,
            prevY = 0.5;

        async function loop(t) {
            // 비디오 준비 체크
            if (video.readyState < 2) {
                requestAnimationFrame(loop);
                return;
            }

            // 좌우반전 (전면 카메라용)
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();

            const res = await landmarker.detectForVideo(
                canvas,
                t || performance.now()
            );

            if (res && res.faceLandmarks && res.faceLandmarks.length > 0) {
                const lm = res.faceLandmarks[0];
                const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
                const cy = lm.reduce((s, p) => s + p.y, 0) / lm.length;

                const dx = (cx - 0.5) * sensitivity;
                const dy = (cy - 0.5) * sensitivity;

                if (
                    Math.abs(dx - prevX) > 0.01 ||
                    Math.abs(dy - prevY) > 0.01
                ) {
                    prevX = dx;
                    prevY = dy;
                    const payload = JSON.stringify({ x: dx, y: dy });
                    safeSend(gameObjectName, methodName, payload);
                }
            }

            requestAnimationFrame(loop);
        }

        console.log("🚀 FaceTracker started.");
        requestAnimationFrame(loop);
    },
};
