#!/bin/bash
# Generate ALL Bear Trap audio assets — ElevenLabs Creator plan
set -e

ELEVENLABS_KEY=$(python3 -c "import json; print(json.load(open('/home/osobot/.openclaw/secrets.json'))['elevenlabs']['api_key'])")
OUTPUT_DIR="/home/osobot/projects/bear-trap/frontend/public/audio"
mkdir -p "$OUTPUT_DIR"

VOICE_ID="Ey0uxikca5MyBcfS3DhG"  # The Trapper (custom designed voice)
MODEL="eleven_multilingual_v2"

generate_voice() {
  local filename="$1"
  local text="$2"
  local stability="${3:-0.3}"
  local style="${4:-0.7}"
  
  echo "  → $filename"
  curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \
    -H "xi-api-key: $ELEVENLABS_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"$text\",
      \"model_id\": \"$MODEL\",
      \"voice_settings\": {
        \"stability\": $stability,
        \"similarity_boost\": 0.8,
        \"style\": $style,
        \"use_speaker_boost\": true
      }
    }" --output "$OUTPUT_DIR/$filename"
  
  if file "$OUTPUT_DIR/$filename" | grep -q "JSON\|ASCII\|text"; then
    echo "    ⚠️  ERROR:"
    cat "$OUTPUT_DIR/$filename"
    echo ""
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

generate_sfx() {
  local filename="$1"
  local prompt="$2"
  local duration="${3:-}"
  
  echo "  → $filename"
  local duration_param=""
  if [ -n "$duration" ]; then
    duration_param=", \"duration_seconds\": $duration"
  fi
  
  curl -s -X POST "https://api.elevenlabs.io/v1/sound-generation" \
    -H "xi-api-key: $ELEVENLABS_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"$prompt\",
      \"prompt_influence\": 0.5
      $duration_param
    }" --output "$OUTPUT_DIR/$filename"
  
  if file "$OUTPUT_DIR/$filename" | grep -q "JSON\|ASCII\|text"; then
    echo "    ⚠️  ERROR:"
    cat "$OUTPUT_DIR/$filename"
    echo ""
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

generate_music() {
  local filename="$1"
  local prompt="$2"
  local duration_ms="$3"
  
  echo "  → $filename (${duration_ms}ms)"
  curl -s -X POST "https://api.elevenlabs.io/v1/music" \
    -H "xi-api-key: $ELEVENLABS_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"prompt\": \"$prompt\",
      \"music_length_ms\": $duration_ms
    }" --output "$OUTPUT_DIR/$filename"
  
  if file "$OUTPUT_DIR/$filename" | grep -q "JSON\|ASCII\|text"; then
    echo "    ⚠️  ERROR:"
    cat "$OUTPUT_DIR/$filename"
    echo ""
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

echo "=== VOICEOVER — Missing Lines ==="

# Re-generate "broken" with the full text (was shortened due to quota)
generate_voice "trapper-broken.mp3" "The trap is broken. But I'll return." 0.3 0.8

# Missing lines
generate_voice "trapper-teaser.mp3" "Something is coming... The trap is being set." 0.25 0.7

generate_voice "trapper-error.mp3" "The connection is unstable. The trap waits." 0.35 0.5

echo ""
echo "=== SOUND EFFECTS ==="

generate_sfx "sfx-tick.mp3" "Single deep metallic tick sound, clock mechanism, ominous, dark, reverberant" 1.0

generate_sfx "sfx-boom.mp3" "Deep cinematic boom with long reverb tail, dramatic reveal impact, dark orchestral hit, subsonic bass" 3.0

generate_sfx "sfx-fire.mp3" "Quick fire ignition burst and crackling flames, paper burning, intense but short" 2.0

generate_sfx "sfx-trap-snap.mp3" "Metal bear trap snapping shut violently, heavy metallic jaw clamping, mechanical spring release, harsh industrial" 2.0

generate_sfx "sfx-chime.mp3" "Ascending crystalline chime sequence, magical ethereal verification sound, hopeful tones rising, fantasy game achievement" 2.5

generate_sfx "sfx-chain-break.mp3" "Heavy metal chain shattering and breaking apart with links scattering on stone floor, triumphant impact, liberation sound" 3.0

generate_sfx "sfx-ambient.mp3" "Low ominous ambient drone, dark suspenseful atmosphere, deep rumbling tension, horror movie undertone, subtle wind" 10.0

echo ""
echo "=== MUSIC ==="

generate_music "music-ambient.mp3" "Dark minimal ambient electronic music, tense and mysterious, low analog synth pads, subtle ominous pulse, suspenseful cinematic atmosphere, minor key, slow tempo, loopable background music for a cryptographic puzzle game" 30000

generate_music "music-victory.mp3" "Short triumphant orchestral victory fanfare with epic brass, heroic achievement unlocked moment, celebratory dramatic resolution, major key ascending, cinematic game win" 8000

echo ""
echo "=== DONE ==="
ls -la "$OUTPUT_DIR/"
echo ""
echo "Total size: $(du -sh "$OUTPUT_DIR/" | cut -f1)"
