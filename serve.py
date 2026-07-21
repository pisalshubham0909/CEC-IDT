import http.server
import socketserver
import webbrowser
import threading
import time
import sys

PORT = 8000

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run_server():
    global PORT
    handler = http.server.SimpleHTTPRequestHandler
    
    class CORSRequestHandler(handler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'X-Password, X-Level, Content-Type')
            self.end_headers()

        def send_api_response(self, data, content_type="application/octet-stream"):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if self.path.startswith("/api/"):
                self.handle_api()
            else:
                self.send_error(404)

        def handle_api(self):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b""
                
                import io
                from pypdf import PdfReader, PdfWriter
                
                if self.path == "/api/encrypt":
                    password = self.headers.get('X-Password', '')
                    reader = PdfReader(io.BytesIO(body))
                    writer = PdfWriter()
                    for page in reader.pages:
                        writer.add_page(page)
                    writer.encrypt(user_password=password)
                    
                    out_buffer = io.BytesIO()
                    writer.write(out_buffer)
                    self.send_api_response(out_buffer.getvalue(), "application/pdf")
                    
                elif self.path == "/api/decrypt":
                    password = self.headers.get('X-Password', '')
                    reader = PdfReader(io.BytesIO(body))
                    if reader.is_encrypted:
                        reader.decrypt(password)
                    writer = PdfWriter()
                    for page in reader.pages:
                        writer.add_page(page)
                        
                    out_buffer = io.BytesIO()
                    writer.write(out_buffer)
                    self.send_api_response(out_buffer.getvalue(), "application/pdf")
                    
                elif self.path == "/api/compress":
                    reader = PdfReader(io.BytesIO(body))
                    writer = PdfWriter()
                    for page in reader.pages:
                        writer.add_page(page)
                    
                    writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
                    for page in writer.pages:
                        page.compress_content_streams()
                        
                    out_buffer = io.BytesIO()
                    writer.write(out_buffer)
                    
                    res_bytes = out_buffer.getvalue()
                    if len(res_bytes) >= len(body):
                        res_bytes = body
                        
                    self.send_api_response(res_bytes, "application/pdf")
                    
                else:
                    self.send_error(404, "API endpoint not found")
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f"Error: {str(e)}".encode('utf-8'))

    # Find an open port starting from 8000
    for attempt in range(20):
        try:
            httpd = ThreadingHTTPServer(("", PORT), CORSRequestHandler)
            print(f"\n=======================================================")
            print(f"  CEC IDT Automation Tool Server is running!")
            print(f"  URL: http://localhost:{PORT}")
            print(f"  Press Ctrl+C to stop the server.")
            print(f"=======================================================\n")
            
            def open_browser():
                time.sleep(0.8)
                webbrowser.open(f"http://localhost:{PORT}")
            
            threading.Thread(target=open_browser, daemon=True).start()
            httpd.serve_forever()
            break
        except OSError:
            print(f"Port {PORT} is in use. Trying next port...")
            PORT += 1
    else:
        print("Could not find an available port to start the server. Exiting.")
        sys.exit(1)

if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nStopping server. Goodbye!")
        sys.exit(0)
