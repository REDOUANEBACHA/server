#!/usr/bin/env python3
"""
BlazePose Golf Swing Analyzer — standalone script.

Usage: python analyze.py <video_path>
Outputs JSON to stdout.
"""

import json
import math
import sys

import cv2
import mediapipe as mp
import numpy as np

mp_pose = mp.solutions.pose


# ─── Geometry helpers ────────────────────────────────────────────────────────────

def angle_between(a, b, c):
    """Angle at point b formed by points a-b-c, in degrees."""
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    cos = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def horizontal_angle(a, b):
    """Angle of line a→b relative to horizontal, in degrees."""
    return float(math.degrees(math.atan2(a.y - b.y, a.x - b.x)))


# ─── Swing phase detection ──────────────────────────────────────────────────────

def detect_phases(wrist_y_series):
    if len(wrist_y_series) < 10:
        return []

    smoothed = np.convolve(wrist_y_series, np.ones(5) / 5, mode="same").tolist()
    n = len(smoothed)

    top_frame = int(np.argmin(smoothed))

    impact_search = smoothed[top_frame:]
    if len(impact_search) < 3:
        return []
    impact_frame = top_frame + int(np.argmax(impact_search))

    phases = []
    if top_frame > 5:
        phases.append({"name": "address", "start_frame": 0, "end_frame": max(1, top_frame // 4)})
        phases.append({"name": "backswing", "start_frame": max(1, top_frame // 4), "end_frame": top_frame})
    phases.append({"name": "top", "start_frame": top_frame, "end_frame": min(top_frame + 3, n - 1)})
    if impact_frame > top_frame:
        phases.append({"name": "downswing", "start_frame": top_frame, "end_frame": impact_frame})
        phases.append({"name": "impact", "start_frame": impact_frame, "end_frame": min(impact_frame + 3, n - 1)})
    if impact_frame < n - 5:
        phases.append({"name": "follow_through", "start_frame": impact_frame, "end_frame": n - 1})

    return phases


# ─── Score & tips ────────────────────────────────────────────────────────────────

def compute_score_and_tips(key_angles, phases, head_positions):
    score = 70.0
    tips = []

    # Head stability
    head_stability = 50.0
    if len(head_positions) > 5:
        xs = [p[0] for p in head_positions]
        ys = [p[1] for p in head_positions]
        head_std = float(np.std(xs) + np.std(ys))
        head_stability = max(0, 100 - head_std * 500)
        if head_stability < 60:
            tips.append("Gardez la tête plus stable pendant le swing.")
            score -= 10
        elif head_stability > 80:
            score += 5

    # Elbow at impact
    impact_phases = [p for p in phases if p["name"] == "impact"]
    if impact_phases and key_angles:
        impact_frame = impact_phases[0]["start_frame"]
        impact_angles = [a for a in key_angles if a["frame"] == impact_frame]
        if impact_angles:
            le = impact_angles[0].get("left_elbow")
            if le and le < 150:
                tips.append(f"Bras gauche plié à l'impact ({le:.0f}°) — visez ~170°.")
                score -= 8
            elif le and le >= 165:
                score += 5

    # Tempo ratio
    tempo_ratio = None
    bs = [p for p in phases if p["name"] == "backswing"]
    ds = [p for p in phases if p["name"] == "downswing"]
    if bs and ds:
        bs_len = bs[0]["end_frame"] - bs[0]["start_frame"]
        ds_len = ds[0]["end_frame"] - ds[0]["start_frame"]
        if ds_len > 0:
            tempo_ratio = round(bs_len / ds_len, 2)
            if 2.5 <= tempo_ratio <= 3.5:
                score += 10
                tips.append(f"Excellent tempo ({tempo_ratio}:1).")
            elif tempo_ratio < 2.0:
                tips.append(f"Backswing trop rapide ({tempo_ratio}:1) — ralentissez.")
                score -= 5
            elif tempo_ratio > 4.0:
                tips.append(f"Downswing trop lent ({tempo_ratio}:1) — accélérez.")
                score -= 5

    # Hip rotation
    hip_rotations = [a.get("hip_rotation", 0) for a in key_angles if a.get("hip_rotation") is not None]
    if hip_rotations and max(hip_rotations) < 30:
        tips.append("Rotation des hanches insuffisante — tournez plus.")
        score -= 5

    # Knee flex
    knee_angles = [a.get("right_knee") for a in key_angles if a.get("right_knee") is not None]
    if knee_angles:
        if min(knee_angles) < 140:
            score += 3
        else:
            tips.append("Fléchissez davantage les genoux.")

    if not tips:
        tips.append("Bon swing — continuez à travailler la régularité.")

    return max(0, min(100, round(score, 1))), round(head_stability, 1), tempo_ratio, tips


# ─── Main analysis ───────────────────────────────────────────────────────────────

def analyze(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"error": "Impossible d'ouvrir la vidéo"}

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_s = total_frames / fps

    key_angles = []
    wrist_y_series = []
    head_positions = []
    max_hip_rotation = 0.0
    max_shoulder_rotation = 0.0

    sample_interval = max(1, total_frames // 30)

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % sample_interval == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(rgb)

                if results.pose_landmarks:
                    lm = results.pose_landmarks.landmark
                    L = mp_pose.PoseLandmark

                    angles = {
                        "frame": frame_idx,
                        "timestamp_ms": round(frame_idx / fps * 1000, 1),
                        "left_elbow": angle_between(lm[L.LEFT_SHOULDER], lm[L.LEFT_ELBOW], lm[L.LEFT_WRIST]),
                        "right_elbow": angle_between(lm[L.RIGHT_SHOULDER], lm[L.RIGHT_ELBOW], lm[L.RIGHT_WRIST]),
                        "left_shoulder": angle_between(lm[L.LEFT_HIP], lm[L.LEFT_SHOULDER], lm[L.LEFT_ELBOW]),
                        "right_shoulder": angle_between(lm[L.RIGHT_HIP], lm[L.RIGHT_SHOULDER], lm[L.RIGHT_ELBOW]),
                        "left_hip": angle_between(lm[L.LEFT_SHOULDER], lm[L.LEFT_HIP], lm[L.LEFT_KNEE]),
                        "right_hip": angle_between(lm[L.RIGHT_SHOULDER], lm[L.RIGHT_HIP], lm[L.RIGHT_KNEE]),
                        "left_knee": angle_between(lm[L.LEFT_HIP], lm[L.LEFT_KNEE], lm[L.LEFT_ANKLE]),
                        "right_knee": angle_between(lm[L.RIGHT_HIP], lm[L.RIGHT_KNEE], lm[L.RIGHT_ANKLE]),
                        "spine_angle": angle_between(lm[L.LEFT_SHOULDER], lm[L.LEFT_HIP], lm[L.LEFT_KNEE]),
                    }

                    hr = abs(horizontal_angle(lm[L.LEFT_HIP], lm[L.RIGHT_HIP]))
                    angles["hip_rotation"] = round(hr, 1)
                    max_hip_rotation = max(max_hip_rotation, hr)

                    sr = abs(horizontal_angle(lm[L.LEFT_SHOULDER], lm[L.RIGHT_SHOULDER]))
                    max_shoulder_rotation = max(max_shoulder_rotation, sr)

                    key_angles.append(angles)
                    wrist_y_series.append(float(lm[L.RIGHT_WRIST].y))
                    head_positions.append((float(lm[L.NOSE].x), float(lm[L.NOSE].y)))

            frame_idx += 1

    cap.release()

    if not key_angles:
        return {"error": "Aucune pose détectée dans la vidéo"}

    phases = detect_phases(wrist_y_series)
    swing_score, head_stability, tempo_ratio, tips = compute_score_and_tips(key_angles, phases, head_positions)

    return {
        "total_frames": total_frames,
        "fps": round(fps, 1),
        "duration_s": round(duration_s, 2),
        "key_angles": key_angles,
        "phases": phases,
        "swing_score": swing_score,
        "tempo_ratio": tempo_ratio,
        "max_hip_rotation": round(max_hip_rotation, 1),
        "max_shoulder_rotation": round(max_shoulder_rotation, 1),
        "head_stability": head_stability,
        "tips": tips,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python analyze.py <video_path>"}))
        sys.exit(1)

    result = analyze(sys.argv[1])
    print(json.dumps(result))
