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
            self.send_header('Access-Control-Allow-Headers', 'X-Password, X-Level, Content-Type, X-Session-ID')
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
                
                import io, uuid, struct
                try:
                    import pypdfium2 as pdfium
                    HAS_PDFIUM = True
                except ImportError:
                    HAS_PDFIUM = False
                from pypdf import PdfReader, PdfWriter

                global MERGE_SESSIONS
                if 'MERGE_SESSIONS' not in globals():
                    MERGE_SESSIONS = {}

                if self.path == "/api/merge_start":
                    session_id = str(uuid.uuid4())
                    MERGE_SESSIONS[session_id] = {
                        'master': pdfium.PdfDocument.new() if HAS_PDFIUM else PdfWriter(),
                        'type': 'pdfium' if HAS_PDFIUM else 'pypdf',
                        'created': time.time()
                    }
                    self.send_api_response(session_id.encode('utf-8'), "text/plain")

                elif self.path.startswith("/api/merge_chunk"):
                    session_id = self.headers.get('X-Session-ID', '')
                    if session_id in MERGE_SESSIONS:
                        sess = MERGE_SESSIONS[session_id]
                        offset = 0
                        body_len = len(body)
                        while offset < body_len:
                            if offset + 4 > body_len:
                                break
                            file_len = struct.unpack('>I', body[offset:offset+4])[0]
                            offset += 4
                            if offset + file_len > body_len:
                                break
                            file_bytes = body[offset:offset+file_len]
                            offset += file_len
                            
                            if sess['type'] == 'pdfium':
                                try:
                                    src_doc = pdfium.PdfDocument(file_bytes)
                                    sess['master'].import_pages(src_doc)
                                    src_doc.close()
                                except Exception as pdf_err:
                                    print(f"Warning during PDFium chunk merge: {pdf_err}")
                                    try:
                                        # Fallback to pypdf for problematic file
                                        reader = PdfReader(io.BytesIO(file_bytes), strict=False)
                                        temp_writer = PdfWriter()
                                        for p in reader.pages: temp_writer.add_page(p)
                                        t_buf = io.BytesIO()
                                        temp_writer.write(t_buf)
                                        temp_doc = pdfium.PdfDocument(t_buf.getvalue())
                                        sess['master'].import_pages(temp_doc)
                                        temp_doc.close()
                                    except Exception as e2:
                                        print(f"File skipped due to severe corruption: {e2}")
                            else:
                                try:
                                    sess['master'].append(io.BytesIO(file_bytes))
                                except Exception as pdf_err:
                                    print(f"Warning during pypdf chunk merge: {pdf_err}")

                        self.send_api_response(b"OK", "text/plain")
                    else:
                        self.send_error(400, "Invalid Session ID")

                elif self.path.startswith("/api/merge_finish"):
                    session_id = self.headers.get('X-Session-ID', '')
                    if session_id in MERGE_SESSIONS:
                        sess = MERGE_SESSIONS.pop(session_id)
                        out_buffer = io.BytesIO()
                        if sess['type'] == 'pdfium':
                            sess['master'].save(out_buffer)
                            sess['master'].close()
                        else:
                            sess['master'].write(out_buffer)
                        self.send_api_response(out_buffer.getvalue(), "application/pdf")
                    else:
                        self.send_error(400, "Invalid Session ID")

                elif self.path == "/api/encrypt":
                    password = self.headers.get('X-Password', '')
                    out_buffer = io.BytesIO()
                    if HAS_PDFIUM:
                        pdf = pdfium.PdfDocument(body)
                        pdf.save(out_buffer, user_password=password, owner_password=password)
                        pdf.close()
                    else:
                        reader = PdfReader(io.BytesIO(body), strict=False)
                        writer = PdfWriter()
                        writer.append(reader)
                        writer.encrypt(user_password=password)
                        writer.write(out_buffer)
                    self.send_api_response(out_buffer.getvalue(), "application/pdf")
                    
                elif self.path == "/api/decrypt":
                    password = self.headers.get('X-Password', '')
                    out_buffer = io.BytesIO()
                    if HAS_PDFIUM:
                        pdf = pdfium.PdfDocument(body, password=password)
                        pdf.save(out_buffer)
                        pdf.close()
                    else:
                        reader = PdfReader(io.BytesIO(body), strict=False)
                        if reader.is_encrypted:
                            reader.decrypt(password)
                        writer = PdfWriter()
                        writer.append(reader)
                        writer.write(out_buffer)
                    self.send_api_response(out_buffer.getvalue(), "application/pdf")
                    
                elif self.path == "/api/merge":
                    import struct
                    writer = PdfWriter()
                    offset = 0
                    body_len = len(body)
                    files_merged = 0
                    while offset < body_len:
                        if offset + 4 > body_len:
                            break
                        file_len = struct.unpack('>I', body[offset:offset+4])[0]
                        offset += 4
                        if offset + file_len > body_len:
                            break
                        file_bytes = body[offset:offset+file_len]
                        offset += file_len
                        try:
                            writer.append(io.BytesIO(file_bytes))
                            files_merged += 1
                        except Exception as pdf_err:
                            print(f"Warning during backend merge of file {files_merged+1}: {pdf_err}")

                    out_buffer = io.BytesIO()
                    writer.write(out_buffer)
                    self.send_api_response(out_buffer.getvalue(), "application/pdf")

                elif self.path == "/api/compress":
                    level = self.headers.get('X-Level', 'medium')
                    res_bytes = body
                    try:
                        try:
                            import fitz
                            HAS_FITZ = True
                        except ImportError:
                            HAS_FITZ = False

                        if HAS_FITZ:
                            doc = fitz.open(stream=body, filetype="pdf")
                            if level == 'high':
                                max_dim = 1200
                                quality = 45
                            elif level == 'low' or level == 'keep':
                                max_dim = 2400
                                quality = 80
                            else: # medium
                                max_dim = 1600
                                quality = 65

                            from PIL import Image
                            for page in doc:
                                for img_info in page.get_images(full=True):
                                    xref = img_info[0]
                                    try:
                                        base_image = doc.extract_image(xref)
                                        if base_image:
                                            image_bytes = base_image.get("image")
                                            if image_bytes:
                                                pil_img = Image.open(io.BytesIO(image_bytes))
                                                w, h = pil_img.size
                                                scale = 1.0
                                                if max(w, h) > max_dim:
                                                    scale = max_dim / float(max(w, h))
                                                    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
                                                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                                                if pil_img.mode not in ('RGB', 'L'):
                                                    pil_img = pil_img.convert('RGB')
                                                out_b = io.BytesIO()
                                                pil_img.save(out_b, format='JPEG', quality=quality, optimize=True)
                                                new_bytes = out_b.getvalue()
                                                if len(new_bytes) < len(image_bytes) or scale < 1.0:
                                                    doc.update_stream(xref, new_bytes)
                                    except Exception:
                                        pass

                            comp_bytes = doc.tobytes(garbage=4, deflate=True, clean=True, deflate_images=True, deflate_fonts=True)
                            if len(comp_bytes) < len(body):
                                res_bytes = comp_bytes
                            else:
                                res_bytes = comp_bytes
                        else:
                            reader = PdfReader(io.BytesIO(body), strict=False)
                            writer = PdfWriter()
                            writer.append(reader)

                            if level == 'high':
                                max_dim = 1200
                                quality = 45
                            elif level == 'low' or level == 'keep':
                                max_dim = 2400
                                quality = 80
                            else: # medium
                                max_dim = 1600
                                quality = 65

                            from PIL import Image
                            for page in writer.pages:
                                page.compress_content_streams()
                                try:
                                    for img_file in page.images:
                                        try:
                                            pil_img = img_file.image
                                            w, h = pil_img.size
                                            scale = 1.0
                                            if max(w, h) > max_dim:
                                                scale = max_dim / float(max(w, h))
                                                new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
                                                pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                                            if pil_img.mode not in ('RGB', 'L'):
                                                pil_img = pil_img.convert('RGB')
                                            out_b = io.BytesIO()
                                            pil_img.save(out_b, format='JPEG', quality=quality, optimize=True)
                                            new_b = out_b.getvalue()
                                            if len(new_b) < len(img_file.data) or scale < 1.0:
                                                img_file.replace(pil_img, quality=quality)
                                        except Exception:
                                            pass
                                except Exception:
                                    pass

                            writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
                            out_buffer = io.BytesIO()
                            writer.write(out_buffer)
                            comp_bytes = out_buffer.getvalue()
                            if len(comp_bytes) < len(body):
                                res_bytes = comp_bytes
                    except Exception as comp_err:
                        print(f"Backend compression fallback warning: {comp_err}")
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
