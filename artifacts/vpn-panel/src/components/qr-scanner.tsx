import React, { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    
    scannerRef.current.render(
      (text) => {
        scannerRef.current?.clear();
        onScan(text);
      },
      () => {} // ignore ongoing errors
    );

    return () => {
      scannerRef.current?.clear().catch(console.error);
    };
  }, [onScan]);

  return (
    <div className="bg-background/80 p-2 border border-primary/30 rounded-sm">
      <div id="qr-reader" className="w-full" />
      <style>{`
        #qr-reader { border: none !important; }
        #qr-reader__scan_region { background: transparent !important; }
        #qr-reader button {
          background: rgba(0, 212, 170, 0.1);
          color: #00d4aa;
          border: 1px solid rgba(0, 212, 170, 0.5);
          padding: 8px 16px;
          text-transform: uppercase;
          font-family: 'Rajdhani', sans-serif;
          letter-spacing: 1px;
          cursor: pointer;
          margin-top: 10px;
        }
        #qr-reader__dashboard_section_csr span { color: #fff !important; }
      `}</style>
    </div>
  );
}
