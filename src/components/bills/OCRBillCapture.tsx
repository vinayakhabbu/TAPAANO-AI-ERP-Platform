import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Upload, 
  FileText, 
  Scan, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Eye,
  Edit2,
  Trash2,
  Camera,
  File
} from "lucide-react";
import { toast } from "sonner";

interface ExtractedField {
  field: string;
  value: string;
  confidence: number;
  verified: boolean;
}

interface ProcessedBill {
  id: string;
  fileName: string;
  status: "processing" | "review" | "approved" | "error";
  extractedData: ExtractedField[];
  thumbnail?: string;
  uploadedAt: Date;
}

export function OCRBillCapture() {
  const [isDragging, setIsDragging] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<ProcessedBill[]>([]);
  const [selectedBill, setSelectedBill] = useState<ProcessedBill | null>(null);

  const simulateOCRProcessing = useCallback((file: File): Promise<ProcessedBill> => {
    return new Promise((resolve) => {
      const mockExtractedData: ExtractedField[] = [
        { field: "Vendor Name", value: "Acme Supplies Inc.", confidence: 0.98, verified: false },
        { field: "Invoice Number", value: `INV-${Math.floor(Math.random() * 100000)}`, confidence: 0.95, verified: false },
        { field: "Invoice Date", value: new Date().toISOString().split('T')[0], confidence: 0.92, verified: false },
        { field: "Due Date", value: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], confidence: 0.89, verified: false },
        { field: "Subtotal", value: `$${(Math.random() * 10000).toFixed(2)}`, confidence: 0.94, verified: false },
        { field: "Tax", value: `$${(Math.random() * 1000).toFixed(2)}`, confidence: 0.91, verified: false },
        { field: "Total Amount", value: `$${(Math.random() * 12000).toFixed(2)}`, confidence: 0.97, verified: false },
        { field: "Payment Terms", value: "Net 30", confidence: 0.85, verified: false },
        { field: "PO Number", value: `PO-${Math.floor(Math.random() * 10000)}`, confidence: 0.78, verified: false },
      ];

      setTimeout(() => {
        resolve({
          id: crypto.randomUUID(),
          fileName: file.name,
          status: "review",
          extractedData: mockExtractedData,
          uploadedAt: new Date(),
        });
      }, 2000 + Math.random() * 2000);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newBills: ProcessedBill[] = [];
    
    for (const file of Array.from(files)) {
      if (!file.type.includes('pdf') && !file.type.includes('image')) {
        toast.error(`${file.name} is not a supported format`);
        continue;
      }

      const processingBill: ProcessedBill = {
        id: crypto.randomUUID(),
        fileName: file.name,
        status: "processing",
        extractedData: [],
        uploadedAt: new Date(),
      };
      
      newBills.push(processingBill);
    }

    setProcessingQueue(prev => [...prev, ...newBills]);

    // Process each file
    for (let i = 0; i < newBills.length; i++) {
      const file = files[i];
      const processedBill = await simulateOCRProcessing(file);
      
      setProcessingQueue(prev => 
        prev.map(b => b.id === newBills[i].id ? { ...processedBill, id: b.id } : b)
      );
    }

    toast.success(`${files.length} document(s) processed successfully`);
  }, [simulateOCRProcessing]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const verifyField = (billId: string, fieldIndex: number) => {
    setProcessingQueue(prev => prev.map(bill => {
      if (bill.id === billId) {
        const newData = [...bill.extractedData];
        newData[fieldIndex] = { ...newData[fieldIndex], verified: true };
        return { ...bill, extractedData: newData };
      }
      return bill;
    }));
  };

  const approveBill = (billId: string) => {
    setProcessingQueue(prev => prev.map(bill => 
      bill.id === billId ? { ...bill, status: "approved" as const } : bill
    ));
    toast.success("Bill approved and ready to create");
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600 bg-green-50";
    if (confidence >= 0.7) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getStatusBadge = (status: ProcessedBill["status"]) => {
    switch (status) {
      case "processing":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "review":
        return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><Eye className="h-3 w-3" /> Needs Review</Badge>;
      case "approved":
        return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "error":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            OCR Bill Capture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Drop bills, invoices, or receipts here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports PDF, PNG, JPG - AI will extract all details automatically
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="gap-2" asChild>
                  <label>
                    <File className="h-4 w-4" />
                    Browse Files
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                  </label>
                </Button>
                <Button variant="outline" className="gap-2">
                  <Camera className="h-4 w-4" />
                  Take Photo
                </Button>
              </div>
            </div>
          </div>

          {/* Processing Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{processingQueue.length}</div>
              <div className="text-xs text-muted-foreground">Total Uploaded</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {processingQueue.filter(b => b.status === "processing").length}
              </div>
              <div className="text-xs text-muted-foreground">Processing</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {processingQueue.filter(b => b.status === "review").length}
              </div>
              <div className="text-xs text-muted-foreground">Needs Review</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {processingQueue.filter(b => b.status === "approved").length}
              </div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Queue */}
      {processingQueue.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Document List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Document Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {processingQueue.map((bill) => (
                <div
                  key={bill.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                    selectedBill?.id === bill.id ? "border-primary bg-muted/30" : ""
                  }`}
                  onClick={() => setSelectedBill(bill)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{bill.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {bill.uploadedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(bill.status)}
                  </div>
                  {bill.status === "processing" && (
                    <Progress value={66} className="mt-2 h-1" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Extracted Data Review */}
          {selectedBill && selectedBill.status !== "processing" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Extracted Data</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => approveBill(selectedBill.id)}
                      disabled={selectedBill.status === "approved"}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {selectedBill.status === "approved" ? "Approved" : "Approve & Create Bill"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedBill.extractedData.map((field, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">{field.field}</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input 
                          value={field.value} 
                          className="h-8"
                          readOnly={field.verified}
                        />
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getConfidenceColor(field.confidence)}`}
                        >
                          {Math.round(field.confidence * 100)}%
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={field.verified ? "text-green-600" : ""}
                      onClick={() => verifyField(selectedBill.id, index)}
                    >
                      {field.verified ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Edit2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}

                <Separator className="my-4" />

                <div className="text-xs text-muted-foreground">
                  <p>✓ AI extracted {selectedBill.extractedData.length} fields</p>
                  <p>✓ Average confidence: {Math.round(
                    selectedBill.extractedData.reduce((acc, f) => acc + f.confidence, 0) / 
                    selectedBill.extractedData.length * 100
                  )}%</p>
                  <p>✓ {selectedBill.extractedData.filter(f => f.verified).length} fields verified</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
