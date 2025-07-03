from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import PyPDF2
import io
import requests
import os
from dotenv import load_dotenv
import base64

# --- Load environment variables ---
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- Retrieve API Key ---
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("\n" * 3) # Add some spacing for visibility
    print("-" * 70)
    print("CRITICAL ERROR: GEMINI_API_KEY environment variable NOT SET.")
    print("Please ensure your .env file is in the same directory as app.py")
    print("and contains: GEMINI_API_KEY='YOUR_ACTUAL_GEMINI_API_KEY_HERE'")
    print("Alternatively, hardcode it in app.py for testing (NOT RECOMMENDED FOR PRODUCTION).")
    print("-" * 70)
    print("\n" * 3)
    # Uncomment the line below for quick local testing if you don't want to use .env
    # API_KEY = "YOUR_ACTUAL_GEMINI_API_KEY_HERE" # <--- Replace with your real API key for testing

# --- Define Gemini API URLs ---
GEMINI_TEXT_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
GEMINI_VISION_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent"


@app.route('/upload', methods=['POST', 'OPTIONS'])
@cross_origin()
def upload_file():
    """
    Handles file uploads (PDFs for text extraction, images for acknowledgment without saving).
    Supports CORS preflight requests (OPTIONS).
    """
    if request.method == 'OPTIONS':
        return '', 200

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'}), 400

    filename_lower = file.filename.lower()
    if filename_lower.endswith('.pdf'):
        try:
            pdf_file = io.BytesIO(file.read())
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            text_content = ""
            for page in pdf_reader.pages:
                extracted_text = page.extract_text()
                if extracted_text:
                    text_content += extracted_text + "\n"

            if not text_content.strip():
                return jsonify({'success': False, 'message': 'Could not extract text from PDF. It might be image-based or empty.'}), 400

            return jsonify({
                'success': True,
                'message': 'PDF processed successfully!',
                'extractedText': text_content,
                'fileType': 'pdf'
            }), 200

        except Exception as e:
            print(f"Error processing PDF file: {e}")
            return jsonify({'success': False, 'message': f'Error processing PDF file: {str(e)}'}), 500

    elif filename_lower.endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff')):
        try:
            # Consume the file stream to prevent issues with subsequent uploads
            file_bytes = file.read() 
            return jsonify({
                'success': True,
                'message': 'Image received successfully (not saved on server).',
                'fileType': 'image',
            }), 200
        except Exception as e:
            print(f"Error handling image file: {e}")
            return jsonify({'success': False, 'message': f'Error handling image file: {str(e)}'}), 500

    else:
        return jsonify({'success': False, 'message': 'Unsupported file type. Please upload a PDF or an image.'}), 400

    return jsonify({'success': False, 'message': 'Unknown error during upload'}), 500

@app.route('/summarize', methods=['POST', 'OPTIONS'])
@cross_origin()
def summarize():
    if request.method == 'OPTIONS': return '', 200
    if not API_KEY: return jsonify({'summary': 'API key not configured.'}), 500
    try:
        data = request.get_json()
        documents = data.get('documents', [])
        if not documents: return jsonify({'summary': 'No text documents provided to summarize.'}), 400
        full_text = "\n\n".join(documents)
        prompt = f"Please summarize the following text:\n\n{full_text}"
        chat_history = [{"role": "user", "parts": [{"text": prompt}]}]
        payload = {"contents": chat_history, "generationConfig": {"maxOutputTokens": 500}}
        
        response = requests.post(f"{GEMINI_TEXT_API_URL}?key={API_KEY}", headers={'Content-Type': 'application/json'}, json=payload)
        response.raise_for_status()
        result = response.json()
        summary = result['candidates'][0]['content']['parts'][0]['text'] if result.get('candidates') else "Could not generate summary."
        return jsonify({'summary': summary}), 200
    except requests.exceptions.RequestException as req_e: 
        print(f"API Request Error for summarize: {req_e}")
        return jsonify({'summary': f'API Error: {str(req_e)}. Check your API key and permissions.'}), 500
    except Exception as e: 
        print(f"General Error for summarize: {e}")
        return jsonify({'summary': f'Error: {str(e)}'}), 500

@app.route('/ask', methods=['POST', 'OPTIONS'])
@cross_origin()
def ask():
    if request.method == 'OPTIONS': return '', 200
    if not API_KEY: return jsonify({'answer': 'API key not configured.'}), 500
    try:
        data = request.get_json()
        question = data.get('question', '')
        documents = data.get('documents', [])
        images_b64 = data.get('images', [])
        department = data.get('department', '')
        chat_history = data.get('chatHistory', [])

        if not question and not images_b64:
            return jsonify({'answer': 'No question or images provided.'}), 400

        contents_parts = []

        context_text = "\n\n".join(documents)
        if department:
            context_text = f"The question is related to the '{department}' department.\n\n" + context_text

        if question:
            contents_parts.append({"text": f"Using the following context, answer the question:\n\nContext:\n{context_text}\n\nQuestion: {question}"})
        elif context_text:
             contents_parts.append({"text": f"Using the following context:\n\nContext:\n{context_text}\n"})
        
        for img_data_url in images_b64:
            if ',' in img_data_url:
                try:
                    mime_type = img_data_url.split(';')[0].split(':')[1]
                    base64_data = img_data_url.split(',')[1]
                    contents_parts.append({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64_data
                        }
                    })
                except Exception as e:
                    print(f"Error processing image data URL: {e} for {img_data_url[:50]}...")
                    continue
            else:
                print(f"Warning: Malformed image data URL received: {img_data_url[:50]}...")
                continue

        final_contents = []
        for chat_entry in chat_history:
            if isinstance(chat_entry.get('parts'), list) and chat_entry['parts'] and 'text' in chat_entry['parts'][0]:
                final_contents.append(chat_entry)
            elif 'text' in chat_entry:
                final_contents.append({"role": chat_entry.get('role', 'user'), "parts": [{"text": chat_entry['text']}]})
        
        final_contents.append({"role": "user", "parts": contents_parts})

        payload = {
            "contents": final_contents,
            "generationConfig": {"maxOutputTokens": 800}
        }
        
        api_url = GEMINI_VISION_API_URL if images_b64 else GEMINI_TEXT_API_URL
        
        response = requests.post(f"{api_url}?key={API_KEY}", headers={'Content-Type': 'application/json'}, json=payload)
        response.raise_for_status()
        result = response.json()
        
        answer = "Sorry, I could not generate an answer."
        if result.get('candidates') and result['candidates'][0].get('content') and result['candidates'][0]['content'].get('parts'):
            for part in result['candidates'][0]['content']['parts']:
                if 'text' in part:
                    answer = part['text']
                    break
        elif result.get('error'):
            answer = f"AI Error: {result['error'].get('message', 'Unknown API error')}. Code: {result['error'].get('code', 'N/A')}"
            print(f"Gemini API Error Response: {result['error']}")

        return jsonify({'answer': answer}), 200
    except requests.exceptions.RequestException as req_e: 
        print(f"API Request Error for ask: {req_e}")
        return jsonify({'answer': f'API Error: {str(req_e)}. Check your API key, model permissions, and request format.'}), 500
    except Exception as e: 
        print(f"General Error for ask: {e}")
        return jsonify({'answer': f'Error: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)