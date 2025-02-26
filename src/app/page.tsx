"use client";

import AudiencePoll from "@/components/audience-poll";
import Debater from "@/components/debater";
import LiveTranscript from "@/components/live-transcript";
import AudioVisualizer from "@/components/audio-visualizer";
import { Card } from "@/components/ui/card";
import { Message } from "ai";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [transcript, setTranscript] = useState<
    Array<{ text: string; speaker: "AI" | "Human" }>
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioData, setAudioData] = useState<Uint8Array | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Clean up on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }
    };
  }, []);

  const handleTranscriptReceived = (text: string, speaker: "AI" | "Human") => {
    setTranscript((prev) => [...prev, { text, speaker }]);

    // Add message to chat history
    const newMessage: Message = {
      id: Date.now().toString(),
      role: speaker === "AI" ? "assistant" : "user",
      content: text,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // If we have a valid audio reference but it's not playing, start it
      if (audioRef.current.src) {
        audioRef.current.currentTime = 0; // Start from the beginning
        audioRef.current.play().catch((error) => {
          console.error("Error playing audio:", error);
        });
      } else if (currentAudioUrlRef.current) {
        // If audio source was cleared but we still have the URL
        audioRef.current.src = currentAudioUrlRef.current;
        audioRef.current.play().catch((error) => {
          console.error("Error playing audio:", error);
        });
      }
    }
  };

  const handleAudioResponse = async (audioBlob: Blob) => {
    // Check if this is real-time audio data
    if (audioBlob.type === "application/octet-stream") {
      // Handle real-time audio data for visualization
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      setAudioData(uint8Array);
      setIsPlaying(true);
      return;
    }

    // Store the current audio blob for later playback if needed
    if (!audioBlob) return;

    // First, clean up everything
    const cleanup = async () => {
      // Keep the current audio URL reference for replay capability
      if (audioRef.current) {
        audioRef.current.pause();
        // Don't clear the src here to allow for replay
      }

      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setAudioData(undefined);
      setIsPlaying(false);
    };

    await cleanup();

    // Revoke previous URL to prevent memory leaks
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
    }

    // Create new audio context and elements
    audioContextRef.current = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;

    // Create and set up audio element
    const audio = new Audio();
    const audioUrl = URL.createObjectURL(audioBlob);
    audio.src = audioUrl;
    currentAudioUrlRef.current = audioUrl;
    audioRef.current = audio;

    // Connect the audio pipeline
    audioSourceRef.current =
      audioContextRef.current.createMediaElementSource(audio);
    audioSourceRef.current.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);

    // Set up the animation loop
    const animate = () => {
      if (!analyserRef.current) return;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      setAudioData(dataArray);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Set up event listeners
    audio.addEventListener("play", () => {
      setIsPlaying(true);
      animate();
    });

    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setAudioData(undefined);
    });

    audio.addEventListener("ended", async () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsPlaying(false);
      setAudioData(undefined);
      // Don't run the full cleanup here to allow replaying the audio
      // Just stop the animation and update state
    });

    // Start playback
    try {
      await audio.play();
    } catch (error) {
      console.error("Error playing audio:", error);
      // Don't clear audio state on autoplay failure
      // This allows manual play button to work even if autoplay fails
      setIsPlaying(false);
      setAudioData(undefined);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl space-y-6">
        <div className="py-8">
          <motion.h1
            className="text-4xl font-bold text-center bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Human vs AI: The Great Debate
          </motion.h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-zinc-900/50 border-zinc-800 backdrop-blur-xl rounded-3xl overflow-hidden">
            <AudioVisualizer
              isActive={!!audioData && isPlaying}
              audioData={audioData}
              isProcessing={isProcessing}
            />
            <div className="space-y-4">
              <Debater
                onTranscriptReceived={handleTranscriptReceived}
                onAudioResponse={handleAudioResponse}
                messages={messages}
                onProcessingChange={setIsProcessing}
              />
            </div>
          </Card>

          <div className="space-y-6">
            <LiveTranscript
              transcript={transcript}
              isPlaying={isPlaying}
              onTogglePlayback={togglePlayback}
            />
            <AudiencePoll />
          </div>
        </div>
      </div>
    </main>
  );
}
