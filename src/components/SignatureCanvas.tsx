import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PenTool, RotateCcw, Check, X, Palette } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (dataURL: string) => void;
  onCancel: () => void;
}

export const SignatureCanvas = ({ onSave, onCancel }: SignatureCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const colors = [
    "#000000", // Black
    "#1e40af", // Blue
    "#dc2626", // Red
    "#16a34a", // Green
    "#9333ea", // Purple
    "#ea580c", // Orange
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 200;

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set drawing styles
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
  }, [strokeColor, strokeWidth]);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataURL = canvas.toDataURL("image/png");
    onSave(dataURL);
  }, [onSave]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground mb-1">Create Your Signature</h3>
        <p className="text-sm text-muted-foreground">Draw your signature in the canvas below</p>
      </div>

      {/* Drawing Tools */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="gap-2"
            >
              <Palette className="w-4 h-4" />
              <div 
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: strokeColor }}
              />
            </Button>
            
            {showColorPicker && (
              <Card className="absolute top-full mt-2 p-2 shadow-large z-10">
                <div className="grid grid-cols-3 gap-1">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setStrokeColor(color);
                        setShowColorPicker(false);
                      }}
                      className="w-8 h-8 rounded border-2 hover:scale-110 transition-transform"
                      style={{ 
                        backgroundColor: color,
                        borderColor: color === strokeColor ? "#3b82f6" : "#e5e7eb"
                      }}
                    />
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Size:</span>
            <select
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="text-sm border rounded px-2 py-1 bg-background"
            >
              <option value={1}>Thin</option>
              <option value={2}>Normal</option>
              <option value={3}>Thick</option>
              <option value={4}>Bold</option>
            </select>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={clearCanvas} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Clear
        </Button>
      </div>

      {/* Canvas */}
      <Card className="p-2 bg-signature-canvas">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="border border-border rounded cursor-crosshair w-full"
          style={{ touchAction: "none" }}
        />
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel} className="gap-2">
          <X className="w-4 h-4" />
          Cancel
        </Button>
        <Button onClick={saveSignature} className="gap-2">
          <Check className="w-4 h-4" />
          Save Signature
        </Button>
      </div>
    </div>
  );
};