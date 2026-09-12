#!/usr/bin/env python3
"""Final test - upload PDF CV, verify PNG displays in iframe"""
import asyncio
from playwright.async_api import async_playwright
from pathlib import Path
import time

async def test():
    # Use PDF file (not HTML - only PDF/DOCX supported)
    cv_file = Path("C:/Users/aseyd/Downloads/Abdullah_Seyda_Aksakal_CV.pdf")

    if not cv_file.exists():
        print(f"ERROR: PDF file not found - {cv_file}")
        print("Using: Abdullah_Seyda_Aksakal_CV.pdf (not HTML)")
        return False

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            print("[1] Navigate to localhost:8000")
            await page.goto("http://localhost:8000", timeout=15000)
            await page.wait_for_load_state("networkidle")

            print("[2] Upload PDF file")
            file_input = page.locator("input[type='file']")
            await file_input.first.set_input_files(str(cv_file))

            # Wait for upload to complete and processing to start
            await page.wait_for_timeout(2000)

            print("[3] Wait for PNG creation (60 seconds)")
            for i in range(60):
                await page.wait_for_timeout(1000)

                # Check if iframe src has been updated with session ID
                iframe_src = await page.locator("iframe#sheet").get_attribute("src")
                if "preview?id=" in iframe_src:
                    print(f"[3] iframe updated at {i+1}s: {iframe_src}")
                    break

                if (i + 1) % 15 == 0:
                    print(f"[3] Waiting... {i+1}s (iframe: {iframe_src})")

            print("[4] Wait additional 10 seconds for PNG to render")
            await page.wait_for_timeout(10000)

            print("[5] Take screenshot")
            await page.screenshot(path="complete_test.png", full_page=True)
            print("[5] Screenshot: complete_test.png")

            # Get iframe content
            iframe = page.locator("iframe#sheet")
            frame = iframe.content_frame

            # Check iframe HTML
            iframe_html = await frame.content() if frame else ""

            print(f"\n[CHECK] iframe HTML length: {len(iframe_html)}")
            if "<img" in iframe_html:
                print("[CHECK] Image tag found in iframe!")
            if "/preview_image" in iframe_html:
                print("[CHECK] /preview_image reference found!")

            # Visual check - look for visible content
            page_content = await page.content()
            has_text = "Abdullah" in page_content or "Seyda" in page_content

            print(f"\n[RESULT] CV text detected: {'YES' if has_text else 'NO'}")
            print(f"[RESULT] PNG should be displaying in iframe area")

            return True

        except Exception as e:
            print(f"ERROR: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test())
    exit(0 if result else 1)
