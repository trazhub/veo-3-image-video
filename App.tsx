
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';

// Simplified types for Veo API responses for internal type safety
interface VeoVideo {
  uri: string;
  aspectRatio: string;
}

interface GeneratedVideo {
  video: VeoVideo;
}

interface VeoOperationResponse {
  generatedVideos: GeneratedVideo[];
}

interface VeoOperation {
  done: boolean;
  name: string;
  response?: VeoOperationResponse;
}

// FIX: Correct the TypeScript declaration for window.aistudio. The previous inline object type conflicted with a global declaration. This change introduces the AIStudio interface to match the expected type and resolve the errors.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio: AIStudio;
  }
}

const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={`animate-spin ${className || 'h-6 w-6'}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-4-4V7a4 4 0 014-4h10a4 4 0 014 4v5a4 4 0 01-4 4H7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 16v1a2 2 0 01-2 2H8a2 2 0 01-2-2v-1m4-4l4 4m0-4l-4 4" />
    </svg>
);

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('a series of hand-drawn, pen-and-ink sketches is displayed in a clean, linear sequence. the illustrations feature a man with glasses engaging with a cigarette pack, each step captured with meticulous detail. the sequence begins with the man examining the cigarette pack, his thoughtful expression highlighted with bold lines and shading. the next sketch shows him taking out a cigarette, while another depicts him lighting it, the flame’s soft glow delicately sketched. subsequent illustrations show him smoking and exhaling smoke, the wisps of smoke gracefully etched into fine curves. arrows guide the viewer through each action, ensuring clarity and progression in the narrative. the simple, unembellished background keeps the focus solely on the man and his detailed expressions and movements.');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Checking API key...');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadingMessages = [
    'Warming up the digital canvas...',
    'Sketching the first frame...',
    'Animating the sequence...',
    'Adding final touches...',
    'Rendering your masterpiece...',
    'This can take a few minutes, please hang tight...',
    'Almost there, polishing the pixels...',
  ];

  const checkApiKey = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage('Checking API key...');
    setError(null);
    try {
      if (await window.aistudio.hasSelectedApiKey()) {
        setApiKeySelected(true);
      }
    } catch (e) {
      setError('Could not verify API key. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let interval: number;
    if (isLoading && !generatedVideoUrl) {
      let messageIndex = 0;
      setLoadingMessage(loadingMessages[0]);
      interval = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[messageIndex]);
      }, 3000);
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, generatedVideoUrl]);

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success and re-check, which will set apiKeySelected to true
      await checkApiKey();
    } catch (e) {
      setError('Failed to open API key selection. Please refresh the page and try again.');
    }
  };
  
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const base64 = await blobToBase64(file);
      setImageBase64(base64);
      setGeneratedVideoUrl(null); // Clear previous video
      setError(null);
    }
  };

  const handleGenerateVideo = async () => {
    if (!prompt || !imageBase64 || !imageFile) {
      setError('Please provide an image and a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedVideoUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      let operation: VeoOperation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: {
          imageBytes: imageBase64,
          mimeType: imageFile.type,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio,
        },
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

      if (!downloadLink) {
        throw new Error('Video generation failed: No download link found.');
      }

      const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      
      const videoBlob = await videoResponse.blob();
      const videoUrl = URL.createObjectURL(videoBlob);
      setGeneratedVideoUrl(videoUrl);

    } catch (e: any) {
        const errorMessage = e.message || 'An unknown error occurred.';
        setError(`Error: ${errorMessage}`);
        console.error(e);
        if (errorMessage.includes("Requested entity was not found.") || errorMessage.includes("API key not valid")) {
            setError("Your API Key is invalid or has been revoked. Please select a valid key.");
            setApiKeySelected(false);
        }
    } finally {
      setIsLoading(false);
    }
  };

  if (!apiKeySelected && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
        <SpinnerIcon className="h-12 w-12 text-indigo-400" />
        <p className="mt-4 text-lg text-gray-300">{loadingMessage}</p>
      </div>
    );
  }

  if (!apiKeySelected && !isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-800 p-4">
        <div className="text-center bg-gray-900 p-8 rounded-2xl shadow-2xl max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4 text-white">API Key Required</h2>
          <p className="mb-6 text-gray-400">To use Veo Video Sketcher, you need to select an API key. This enables video generation and ensures your projects are properly managed.</p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
          >
            Select API Key
          </button>
          <p className="mt-4 text-sm text-gray-500">
            For more information on billing, please visit the{' '}
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
              official documentation
            </a>.
          </p>
          {error && <p className="mt-4 text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            Veo Video Sketcher
          </h1>
          <p className="mt-2 text-lg text-gray-400">Bring your sketches to life with AI-powered video generation.</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Column */}
          <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-gray-200">1. Configure Your Animation</h2>
            
            {/* Image Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Upload Sketch</label>
              <div 
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-indigo-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="space-y-1 text-center">
                  <UploadIcon />
                  <div className="flex text-sm text-gray-400">
                    <p className="pl-1">{imageFile ? imageFile.name : 'Click to upload an image'}</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                </div>
              </div>
              <input ref={fileInputRef} id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
            </div>

            {/* Prompt */}
            <div className="mb-6">
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-400">Prompt</label>
              <textarea
                id="prompt"
                rows={8}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded-md shadow-sm py-2 px-3 text-gray-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            
            {/* Aspect Ratio */}
            <div className="mb-8">
              <label htmlFor="aspect-ratio" className="block text-sm font-medium text-gray-400">Aspect Ratio</label>
              <select
                id="aspect-ratio"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16')}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-gray-900 border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-200"
              >
                <option value="9:16">Portrait (9:16)</option>
                <option value="16:9">Landscape (16:9)</option>
              </select>
            </div>
            
            {/* Generate Button */}
            <button
              onClick={handleGenerateVideo}
              disabled={isLoading || !imageFile}
              className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
            >
              {isLoading && <SpinnerIcon className="h-5 w-5 mr-3" />}
              {isLoading ? 'Generating...' : 'Generate Video'}
            </button>
            {error && <p className="mt-4 text-center text-red-400">{error}</p>}
          </div>

          {/* Result Column */}
          <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg border border-gray-700 flex flex-col items-center justify-center min-h-[400px]">
            <h2 className="text-2xl font-bold mb-6 text-gray-200 self-start">2. View Result</h2>
            <div className="w-full flex-grow flex items-center justify-center">
            {isLoading ? (
              <div className="text-center">
                <SpinnerIcon className="h-12 w-12 text-indigo-400 mx-auto" />
                <p className="mt-4 text-lg text-gray-300 animate-pulse">{loadingMessage}</p>
              </div>
            ) : generatedVideoUrl ? (
                <video src={generatedVideoUrl} controls autoPlay loop className="max-w-full max-h-[60vh] rounded-lg shadow-md" />
            ) : imageBase64 ? (
                <img src={`data:${imageFile?.type};base64,${imageBase64}`} alt="Preview" className="max-w-full max-h-[60vh] rounded-lg shadow-md" />
            ) : (
                <div className="text-center text-gray-500">
                    <p>Your generated video will appear here.</p>
                </div>
            )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
