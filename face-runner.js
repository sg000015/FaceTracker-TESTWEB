// face-runner.js
// Unity WebGL 얼굴 중심 추적 전용 (모바일/PC 겸용)

window.__FaceTracker = {
    start: async function (
        gameObjectName = "FaceReceiver",
        method = "OnFaceMove",
        sensitivity = 1.5
    ) {
        // 🔹 카메라 요청
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.display = "none";
        document.body.appendChild(video);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }, // 전면 카메라
        });
        video.srcObject = stream;

        // 🔹 비디오 로드 완료 대기
        await new Promise((res) => (video.onloadedmetadata = res));

        // 🔹 해상도 자동 조정 (가장 긴 변을 320px로 축소)
        const maxSize = 320;
        const scale = maxSize / Math.max(video.videoWidth, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // 🔹 MediaPipe FaceLandmarker 로드
        const vision = await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
        );
        const { FaceLandmarker, FilesetResolver } = vision;

        const resolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(resolver, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            },
            runningMode: "VIDEO",
            numFaces: 1,
        });

        // 🔹 중심 계산용 변수
        let prevX = 0.5,
            prevY = 0.5;

        // 🔹 루프
        async function loop(t) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const res = await landmarker.detectForVideo(
                canvas,
                t || performance.now()
            );

            if (res && res.faceLandmarks && res.faceLandmarks.length > 0) {
                const lm = res.faceLandmarks[0];
                const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
                const cy = lm.reduce((s, p) => s + p.y, 0) / lm.length;

                // 🔸 중앙(0.5,0.5) 기준 상대이동 계산
                const dx = (cx - 0.5) * sensitivity;
                const dy = (cy - 0.5) * sensitivity;

                // 🔸 잡음 방지용 임계값
                if (
                    Math.abs(dx - prevX) > 0.01 ||
                    Math.abs(dy - prevY) > 0.01
                ) {
                    prevX = dx;
                    prevY = dy;
                    const payload = JSON.stringify({ x: dx, y: dy });
                    if (typeof SendMessage === "function") {
                        SendMessage(gameObjectName, method, payload);
                    }
                }
            }
            requestAnimationFrame(loop);
        }

        requestAnimationFrame(loop);
    },
};
