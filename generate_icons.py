"""Generate cat icons for the Petty Chrome extension"""
from PIL import Image, ImageDraw

def draw_cat(size):
    """Draw a brown cat icon at the specified size"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale factors
    scale = size / 128
    
    # Colors
    brown_dark = (139, 69, 19)  # Saddle brown
    brown_light = (161, 86, 35)  # Medium brown
    brown_face = (216, 167, 116)  # Tan
    pink = (255, 109, 158)
    black = (46, 46, 46)
    white = (255, 255, 255)
    
    # Body (ellipse)
    body_x = size * 0.5
    body_y = size * 0.7
    body_rx = size * 0.28
    body_ry = size * 0.19
    draw.ellipse([body_x - body_rx, body_y - body_ry, 
                  body_x + body_rx, body_y + body_ry], 
                 fill=brown_dark)
    
    # Body highlight
    body_rx2 = size * 0.23
    body_ry2 = size * 0.15
    draw.ellipse([body_x - body_rx2, body_y - body_ry2, 
                  body_x + body_rx2, body_y + body_ry2], 
                 fill=brown_light)
    
    # Head
    head_x = size * 0.5
    head_y = size * 0.35
    head_r = size * 0.25
    draw.ellipse([head_x - head_r, head_y - head_r,
                  head_x + head_r, head_y + head_r],
                 fill=brown_dark)
    
    # Head highlight
    head_r2 = size * 0.20
    draw.ellipse([head_x - head_r2, head_y - head_r2,
                  head_x + head_r2, head_y + head_r2],
                 fill=brown_light)
    
    # Ears (triangles)
    ear_size = size * 0.12
    # Left ear
    left_ear = [
        (head_x - head_r * 0.6, head_y - head_r * 0.5),
        (head_x - head_r * 0.8, head_y - head_r * 1.2),
        (head_x - head_r * 0.3, head_y - head_r * 0.8)
    ]
    draw.polygon(left_ear, fill=brown_dark)
    
    # Right ear
    right_ear = [
        (head_x + head_r * 0.6, head_y - head_r * 0.5),
        (head_x + head_r * 0.8, head_y - head_r * 1.2),
        (head_x + head_r * 0.3, head_y - head_r * 0.8)
    ]
    draw.polygon(right_ear, fill=brown_dark)
    
    # Face (muzzle area)
    face_rx = size * 0.12
    face_ry = size * 0.09
    face_y = head_y + head_r * 0.15
    draw.ellipse([head_x - face_rx, face_y - face_ry,
                  head_x + face_rx, face_y + face_ry],
                 fill=brown_face)
    
    # Eyes
    eye_y = head_y - head_r * 0.1
    eye_r = size * 0.05
    # Left eye
    left_eye_x = head_x - head_r * 0.35
    draw.ellipse([left_eye_x - eye_r, eye_y - eye_r,
                  left_eye_x + eye_r, eye_y + eye_r],
                 fill=black)
    # Eye shine
    shine_r = size * 0.015
    draw.ellipse([left_eye_x - eye_r * 0.3, eye_y - eye_r * 0.4,
                  left_eye_x - eye_r * 0.3 + shine_r * 2, 
                  eye_y - eye_r * 0.4 + shine_r * 2],
                 fill=white)
    
    # Right eye
    right_eye_x = head_x + head_r * 0.35
    draw.ellipse([right_eye_x - eye_r, eye_y - eye_r,
                  right_eye_x + eye_r, eye_y + eye_r],
                 fill=black)
    # Eye shine
    draw.ellipse([right_eye_x - eye_r * 0.3, eye_y - eye_r * 0.4,
                  right_eye_x - eye_r * 0.3 + shine_r * 2, 
                  eye_y - eye_r * 0.4 + shine_r * 2],
                 fill=white)
    
    # Nose (small triangle)
    nose_y = face_y
    nose_size = size * 0.04
    nose = [
        (head_x, nose_y - nose_size * 0.3),
        (head_x - nose_size, nose_y + nose_size),
        (head_x + nose_size, nose_y + nose_size)
    ]
    draw.polygon(nose, fill=pink)
    
    # Mouth (two curves)
    mouth_y = nose_y + nose_size
    mouth_width = size * 0.08
    mouth_height = size * 0.05
    # Left side
    draw.arc([head_x - mouth_width * 2, mouth_y - mouth_height,
              head_x, mouth_y + mouth_height],
             0, 90, fill=black, width=max(1, int(size * 0.015)))
    # Right side
    draw.arc([head_x, mouth_y - mouth_height,
              head_x + mouth_width * 2, mouth_y + mouth_height],
             90, 180, fill=black, width=max(1, int(size * 0.015)))
    
    # Whiskers
    whisker_width = max(1, int(size * 0.01))
    whisker_length = size * 0.15
    whisker_y = face_y
    # Left whiskers
    draw.line([head_x - head_r, whisker_y - size * 0.02,
               head_x - head_r - whisker_length, whisker_y - size * 0.03],
              fill=black, width=whisker_width)
    draw.line([head_x - head_r, whisker_y,
               head_x - head_r - whisker_length, whisker_y],
              fill=black, width=whisker_width)
    draw.line([head_x - head_r, whisker_y + size * 0.02,
               head_x - head_r - whisker_length, whisker_y + size * 0.03],
              fill=black, width=whisker_width)
    
    # Right whiskers
    draw.line([head_x + head_r, whisker_y - size * 0.02,
               head_x + head_r + whisker_length, whisker_y - size * 0.03],
              fill=black, width=whisker_width)
    draw.line([head_x + head_r, whisker_y,
               head_x + head_r + whisker_length, whisker_y],
              fill=black, width=whisker_width)
    draw.line([head_x + head_r, whisker_y + size * 0.02,
               head_x + head_r + whisker_length, whisker_y + size * 0.03],
              fill=black, width=whisker_width)
    
    # Tail (curved)
    tail_width = max(2, int(size * 0.05))
    tail_start_x = body_x + body_rx * 0.9
    tail_start_y = body_y
    # Draw tail curve (arc approximation with lines)
    for i in range(10):
        t = i / 10
        x1 = tail_start_x + t * size * 0.15
        y1 = tail_start_y - t * t * size * 0.2
        x2 = tail_start_x + (t + 0.1) * size * 0.15
        y2 = tail_start_y - (t + 0.1) ** 2 * size * 0.2
        draw.line([x1, y1, x2, y2], fill=brown_dark, width=tail_width)
    
    # Paws
    paw_r = size * 0.045
    paw_y = body_y + body_ry * 0.7
    # Left paw
    draw.ellipse([body_x - body_rx * 0.5 - paw_r, paw_y - paw_r,
                  body_x - body_rx * 0.5 + paw_r, paw_y + paw_r * 1.5],
                 fill=brown_dark)
    # Right paw
    draw.ellipse([body_x + body_rx * 0.5 - paw_r, paw_y - paw_r,
                  body_x + body_rx * 0.5 + paw_r, paw_y + paw_r * 1.5],
                 fill=brown_dark)
    
    return img

def main():
    """Generate all icon sizes"""
    sizes = [16, 48, 128]
    
    print("Generating Petty cat icons...")
    for size in sizes:
        print(f"  Creating icon{size}.png...")
        icon = draw_cat(size)
        icon.save(f'icon{size}.png', 'PNG')
    
    print("All icons generated successfully!")

if __name__ == '__main__':
    main()

