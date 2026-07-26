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
            self.send_header('Access-Control-Allow-Headers', 'X-Password, X-Level, X-Mode, Content-Type, X-Session-ID')
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
                
                import io, uuid, struct, tempfile, os
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
                    
                elif self.path == "/api/convert_pdf_to_word":
                    try:
                        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f_pdf:
                            f_pdf.write(body)
                            pdf_path = f_pdf.name
                        docx_path = pdf_path.replace('.pdf', '.docx')
                        try:
                            from pdf2docx import Converter
                            cv = Converter(pdf_path)
                            cv.convert(docx_path, start=0, end=None)
                            cv.close()
                            with open(docx_path, 'rb') as f_docx:
                                res_docx = f_docx.read()
                        finally:
                            if os.path.exists(pdf_path): os.remove(pdf_path)
                            if os.path.exists(docx_path): os.remove(docx_path)
                            
                        self.send_api_response(res_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                    except Exception as conv_err:
                        print(f"Backend PDF to Word conversion error: {conv_err}")
                        self.send_error(500, f"PDF to Word conversion failed: {conv_err}")

                elif self.path == "/api/convert_pdf_to_pptx":
                    try:
                        import fitz
                        from pptx import Presentation
                        from pptx.util import Inches
                        
                        doc_pdf = fitz.open('pdf', body)
                        prs = Presentation()
                        
                        w_p, h_p = 612, 792
                        if len(doc_pdf) > 0:
                            rect0 = doc_pdf[0].rect
                            w_p, h_p = rect0.width, rect0.height
                        
                        prs.slide_width = Inches(10)
                        prs.slide_height = Inches(10 * (h_p / w_p) if w_p > 0 else 7.5)

                        for page_idx in range(len(doc_pdf)):
                            p = doc_pdf[page_idx]
                            rect = p.rect
                            pw, ph = rect.width, rect.height
                            
                            slide = prs.slides.add_slide(prs.slide_layouts[6])
                            scale_x = prs.slide_width.inches / pw if pw > 0 else 1.0
                            scale_y = prs.slide_height.inches / ph if ph > 0 else 1.0
                            
                            blocks = p.get_text('blocks')
                            for b in blocks:
                                if b[6] == 0:
                                    x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
                                    left = Inches(x0 * scale_x)
                                    top = Inches(y0 * scale_y)
                                    width = Inches(max(0.5, (x1 - x0) * scale_x))
                                    height = Inches(max(0.3, (y1 - y0) * scale_y))
                                    
                                    txBox = slide.shapes.add_textbox(left, top, width, height)
                                    tf = txBox.text_frame
                                    tf.word_wrap = True
                                    tf.text = text.strip()
                                    
                            for img_info in p.get_images(full=True):
                                xref = img_info[0]
                                try:
                                    base_img = doc_pdf.extract_image(xref)
                                    if base_img:
                                        img_bytes = base_img['image']
                                        img_stream = io.BytesIO(img_bytes)
                                        rects = p.get_image_rects(xref)
                                        for r in rects:
                                            left = Inches(r.x0 * scale_x)
                                            top = Inches(r.y0 * scale_y)
                                            width = Inches((r.x1 - r.x0) * scale_x)
                                            height = Inches((r.y1 - r.y0) * scale_y)
                                            slide.shapes.add_picture(img_stream, left, top, width, height)
                                except Exception:
                                    pass

                        out_buf = io.BytesIO()
                        prs.save(out_buf)
                        self.send_api_response(out_buf.getvalue(), "application/vnd.openxmlformats-officedocument.presentationml.presentation")
                    except Exception as conv_err:
                        print(f"Backend PDF to PPTX conversion error: {conv_err}")
                        self.send_error(500, f"PDF to PPTX conversion failed: {conv_err}")

                elif self.path == "/api/convert_word_to_pdf":
                    try:
                        import docx
                        from reportlab.lib.pagesizes import letter
                        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
                        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                        from reportlab.lib import colors

                        doc_in = docx.Document(io.BytesIO(body))
                        out_buf = io.BytesIO()
                        pdf_doc = SimpleDocTemplate(out_buf, pagesize=letter, leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54)
                        styles = getSampleStyleSheet()
                        normal_style = styles['Normal']
                        story = []

                        for p_item in doc_in.paragraphs:
                            txt = p_item.text.strip()
                            if not txt:
                                story.append(Spacer(1, 8))
                                continue
                            p_style = ParagraphStyle(
                                'DocxPara',
                                parent=normal_style,
                                fontSize=11,
                                leading=15,
                                spaceAfter=6
                            )
                            story.append(Paragraph(txt, p_style))

                        for tbl_item in doc_in.tables:
                            table_data = []
                            for row in tbl_item.rows:
                                row_data = [cell.text.strip() for cell in row.cells]
                                table_data.append(row_data)
                            if table_data:
                                t = Table(table_data)
                                t.setStyle(TableStyle([
                                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0284c7')),
                                    ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                                    ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                                    ('FONTSIZE', (0,0), (-1,-1), 10),
                                    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                                ]))
                                story.append(t)
                                story.append(Spacer(1, 10))

                        if not story:
                            story.append(Paragraph('Document Empty', normal_style))

                        pdf_doc.build(story)
                        self.send_api_response(out_buf.getvalue(), "application/pdf")
                    except Exception as conv_err:
                        print(f"Backend Word to PDF conversion error: {conv_err}")
                        self.send_error(500, f"Word to PDF conversion failed: {conv_err}")
                    
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
