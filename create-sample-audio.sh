#!/bin/bash

# Create silent MP3 files for testing (requires ffmpeg)
# If ffmpeg is not available, we'll create placeholder HTML5-compatible files

if command -v ffmpeg &> /dev/null; then
    echo "Creating sample audio files with ffmpeg..."
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 -q:a 9 -acodec libmp3lame audio/trap_wave_001.mp3 -y 2>/dev/null
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 -q:a 9 -acodec libmp3lame audio/rnb_vibes_002.mp3 -y 2>/dev/null
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 -q:a 9 -acodec libmp3lame audio/club_banger_003.mp3 -y 2>/dev/null
    echo "✓ Sample audio files created"
else
    echo "ffmpeg not found. Creating placeholder files..."
    # Create minimal valid MP3 headers
    printf '\xFF\xFB\x90\x00' > audio/trap_wave_001.mp3
    printf '\xFF\xFB\x90\x00' > audio/rnb_vibes_002.mp3
    printf '\xFF\xFB\x90\x00' > audio/club_banger_003.mp3
    echo "✓ Placeholder files created (won't play but won't error)"
    echo "⚠️  Install ffmpeg for proper audio: brew install ffmpeg"
fi

ls -lh audio/
