#!/usr/bin/env bash
# Rebuilds every sheet-based hero: rigs (client/src/assets/rigs/h<id>.*) and menu portraits/showcase figures.
set -e
cd "$(dirname "$0")/.."
python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero1.json --key h0
python3 art3d/ai_parts.py --sheet art3d/ai/hero2.png --spec art3d/ai/hero2.json --key h1
python3 art3d/ai_parts.py --sheet art3d/ai/hero2.png --spec art3d/ai/hero_tusk.json --key h2
python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero_viper.json --key h3
python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero_sparky.json --key h4
python3 art3d/ai_parts.py --sheet art3d/ai/hero2.png --spec art3d/ai/hero_ghost.json --key h5
python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero_kiki.json --key h6
python3 art3d/ai_parts.py --sheet art3d/ai/hero2.png --spec art3d/ai/hero_sarge.json --key h7
python3 art3d/ai_portraits.py
