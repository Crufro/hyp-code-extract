"use client";
import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";

// Utility function for downloading data as a file
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Helper to clean filenames
function cleanFilename(name: string): string {
  // Replace spaces with underscores
  let clean = name.replace(/\s+/g, '_');
  
  // Remove any numeric hash-like identifiers (long strings of digits)
  clean = clean.replace(/\d{8,}/g, '');
  
  // Remove any double underscores that might have been created
  clean = clean.replace(/__+/g, '_');
  
  // Remove any trailing or leading underscores
  clean = clean.replace(/^_+|_+$/g, '');
  
  return clean;
}

// Generate timestamp in format YYYY-MM-DD_HH-MM-SS
function getTimestamp(): string {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); 
  const day = String(now.getDate()).padStart(2, '0');
  
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export default function HypExtractor() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(file => 
        file.name.toLowerCase().endsWith('.hyp')
      );
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Function to extract JS code from a .hyp file
  const extractJsFromHyp = async (file: File): Promise<{ name: string, content: string }[]> => {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    
    // Read header size (first 4 bytes)
    const headerSize = view.getUint32(0, true);
    
    // Parse header
    const headerBytes = new Uint8Array(buffer.slice(4, 4 + headerSize));
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    
    // Extract files
    let position = 4 + headerSize;
    const scripts: { name: string, content: string }[] = [];
    
    for (const assetInfo of header.assets) {
      const size = assetInfo.size;
      
      // Check if this is a script asset
      if (assetInfo.type === 'script') {
        const data = buffer.slice(position, position + size);
        const content = new TextDecoder().decode(data);
        const filename = assetInfo.url.split('/').pop() || `script_${scripts.length}.js`;
        
        scripts.push({
          name: cleanFilename(filename),
          content: content
        });
      }
      position += size;
    }
    
    return scripts;
  };

  const processFiles = async () => {
    if (files.length === 0) {
      setStatus("please add some .hyp files first");
      return;
    }
    
    setProcessing(true);
    setStatus("processing files...");
    
    try {
      const allScripts: { name: string, content: string, hyp: string }[] = [];
      
      // Extract JS from each .hyp file
      for (const file of files) {
        setStatus(`processing ${file.name}...`);
        const scripts = await extractJsFromHyp(file);
        
        for (const script of scripts) {
          // Clean the base filename (remove .hyp and replace spaces with underscores)
          const baseName = cleanFilename(file.name.replace(/\.hyp$/i, ""));
          const scriptName = script.name.replace(/\.js$/i, "");
          
          // Create a clean unique name
          const uniqueName = `${baseName}_${scriptName}.js`;
          
          // Add to our collection
          allScripts.push({
            name: uniqueName,
            content: script.content,
            hyp: file.name
          });
        }
      }
      
      if (allScripts.length === 0) {
        setStatus("no javascript found in the uploaded files");
        setProcessing(false);
        return;
      }
      
      // If it's a single file with a single script, download directly
      if (files.length === 1 && allScripts.length === 1) {
        const script = allScripts[0];
        const blob = new Blob([script.content], { type: 'text/javascript' });
        downloadBlob(blob, script.name);
        setStatus(`successfully extracted javascript from ${files[0].name}`);
      } else {
        // Otherwise create a zip with all scripts
        setStatus("creating zip file...");
        const zip = new JSZip();
        
        // Add all scripts to the zip
        for (const script of allScripts) {
          zip.file(script.name, script.content);
        }
        
        // Generate and download the zip with timestamp
        const timestamp = getTimestamp();
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `hyp-scripts_${timestamp}.zip`);
        
        setStatus(`successfully extracted ${allScripts.length} scripts from ${files.length} files`);
      }
    } catch (error) {
      console.error("Error processing files:", error);
      setStatus(`error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  // Handle file drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file => 
        file.name.toLowerCase().endsWith('.hyp')
      );
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, []);
  
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Extract button component for reuse
  const ExtractButton = ({ className = "", size = "normal" }) => {
    const sizeClass = size === "small" ? "small-button" : "normal-button";
      
    return (
      <button
        onClick={processFiles}
        disabled={processing || files.length === 0}
        className={`primary-button ${sizeClass} uppercase tracking-wider ${className}`}
      >
        {processing ? "processing..." : "extract code"}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[rgba(var(--border),0.4)] py-6 px-4 mb-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2 tracking-tighter">.hyp code extractor pro</h1>
          <p className="text-gray-400">
          </p>
        </div>
      </header>
      
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pb-10">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-3 tracking-tighter">select files</h2>
            </div>
            
            <div 
              className="file-drop-zone w-full p-8 bg-[rgb(var(--card))] flex flex-col items-center justify-center shadow-md mb-6 cursor-pointer hover:border-[rgba(var(--accent),0.6)] hover:bg-[rgba(var(--accent),0.05)]"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept=".hyp"
                id="file-input"
              />
              
              <p className="mb-4 text-gray-300">browse for .hyp files</p>
              <p className="text-gray-400">or drag and drop files here</p>
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold tracking-tighter">review files</h2>
                  <button 
                    onClick={clearFiles}
                    className="secondary-button small-button"
                  >
                    clear all
                  </button>
                </div>
                
                <div className="bg-[rgb(var(--card))] rounded-md overflow-hidden border border-[rgba(var(--border),0.6)] shadow-md">
                  <div className="bg-[rgba(var(--border),0.3)] px-4 py-2 text-sm text-gray-300 border-b border-[rgba(var(--border),0.6)]">
                    {files.length} file{files.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                    {files.map((file, index) => (
                      <div key={index} className="file-item flex justify-between items-center hover:bg-[rgba(var(--border),0.2)]">
                        <span className="text-gray-300 text-sm truncate flex-1 font-mono">{file.name}</span>
                        <span 
                          onClick={() => removeFile(index)}
                          className="ml-2 text-gray-300 hover:text-gray-100 text-sm cursor-pointer select-none"
                        >
                          ×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-4">
                {files.length === 0 
                  ? "add files on the left, then click the extract button" 
                  : files.length === 1 
                    ? "click extract to download the javascript from your file" 
                    : `click extract to download javascript from ${files.length} files as a zip`}
              </p>
            </div>
            
            <div>
              <div className="flex justify-center mb-6">
                <ExtractButton className="large-button" />
              </div>
              
              {status && (
                <div className={`status-banner w-full text-sm rounded-md shadow-md ${
                  status.includes("error") 
                    ? "error" 
                    : status.includes("success") 
                      ? "success"
                      : "info"
                }`}>
                  {status}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <footer className="text-center text-gray-500 text-sm py-6 border-t border-[rgba(var(--border),0.4)] mt-10">
        <p>© {new Date().getFullYear()} hype engine™</p>
      </footer>
    </div>
  );
}
