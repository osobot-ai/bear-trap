#!/bin/bash
# Generate all Bear Trap audio assets using ElevenLabs APIs
set -e

ELEVENLABS_KEY=$(python3 -c "import json; print(json.load(open('/home/osobot/.openclaw/secrets.json'))['elevenlabs']['api_key'])")
OUTPUT_DIR="/home/osobot/projects/bear-trap/frontend/public/audio"
mkdir -p "$OUTPUT_DIR"

VOICE_ID="Ey0uxikca5MyBcfS3DhG"  # The Trapper (custom designed voice)
MODEL="eleven_multilingual_v2"

echo "=== Generating Voiceover Lines ==="

# Voice settings: low stability for dramatic variation, high similarity
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
  
  # Verify file is valid MP3 (not error JSON)
  if file "$OUTPUT_DIR/$filename" | grep -q "JSON\|ASCII\|text"; then
    echo "    ⚠️  ERROR: Got text response instead of audio:"
    cat "$OUTPUT_DIR/$filename"
    echo ""
    rm "$OUTPUT_DIR/$filename"
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

# 1. Countdown end
generate_voice "trapper-begin.mp3" "The trap is set. Begin." 0.25 0.8

# 2. Wrong guess
generate_voice "trapper-wrong.mp3" "Wrong. The trap holds." 0.3 0.7

# 3. Proof ready
generate_voice "trapper-proof-valid.mp3" "The proof is valid. Claim what's yours." 0.35 0.6

# 4. Prize claimed
generate_voice "trapper-broken.mp3" "The trap is broken. But I'll return." 0.3 0.8

# 5. Countdown teaser
generate_voice "trapper-teaser.mp3" "Something is coming... The trap is being set." 0.25 0.7

# 6. Error state
generate_voice "trapper-error.mp3" "The connection is unstable. The trap waits." 0.35 0.5

echo ""
echo "=== Generating Sound Effects ==="

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
    rm "$OUTPUT_DIR/$filename"
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

# 1. Countdown tick (metallic, for final 10 seconds)
generate_sfx "sfx-tick.mp3" "Single deep metallic tick sound, clock mechanism, ominous, dark" 1.0

# 2. Puzzle reveal boom
generate_sfx "sfx-boom.mp3" "Deep cinematic boom with reverb, dramatic reveal, dark orchestral impact hit" 3.0

# 3. Ticket burn / fire crackle
generate_sfx "sfx-fire.mp3" "Quick fire ignition and crackle, burning paper, intense flame burst" 2.0

# 4. Wrong guess - bear trap snap
generate_sfx "sfx-trap-snap.mp3" "Metal bear trap snapping shut violently, metallic clang, mechanical jaw closing, harsh" 2.0

# 5. Proof verified - ascending chime
generate_sfx "sfx-chime.mp3" "Ascending crystalline chime, magical verification sound, hopeful ethereal tone rising" 2.5

# 6. Chain breaking - prize claimed
generate_sfx "sfx-chain-break.mp3" "Heavy metal chain breaking and shattering with triumphant impact, links scattering on stone, victorious" 3.0

# 7. Ambient drone (loopable)
generate_sfx "sfx-ambient.mp3" "Low ominous ambient drone, dark suspenseful atmosphere, deep rumbling tension, horror undertone" 10.0

echo ""
echo "=== Generating Music ==="

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
    rm "$OUTPUT_DIR/$filename"
    return 1
  fi
  echo "    ✓ $(du -h "$OUTPUT_DIR/$filename" | cut -f1)"
}

# 1. Background ambient loop - dark, tense
generate_music "music-ambient.mp3" "Dark minimal ambient electronic music, tense and mysterious, low synth pads, subtle pulse, suspenseful atmosphere, cinematic horror undertone, loopable" 30000

# 2. Victory stinger
generate_music "music-victory.mp3" "Short triumphant orchestral victory fanfare, epic brass, heroic achievement unlocked, celebratory, dramatic resolution" 8000

echo ""
echo "=== Done ==="
ls -la "$OUTPUT_DIR/"
echo ""
echo "Total size: $(du -sh "$OUTPUT_DIR/" | cut -f1)"
