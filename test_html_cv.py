#!/usr/bin/env python3
"""Test uploading HTML CV - verify image and text display"""
import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

async def test():
    cv_file = Path("C:/Users/aseyd/Downloads/cv-studio/frontend/Abdullah_Seyda_Aksakal_CV_1page.html")

    if not cv_file.exists():
        print(f"ERROR: File not found - {cv_file}")
        return False

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            print("[1] Navigate to localhost:8000")
            await page.goto("http://localhost:8000", timeout=15000)
            await page.wait_for_load_state("networkidle")

            print("[2] Find file input and upload HTML CV")
            file_input = page.locator("input[type='file']")
            await file_input.first.set_input_files(str(cv_file))
            print(f"[2] Uploaded: {cv_file.name}")

            print("[3] Wait for processing (50 seconds - allow PNG creation)...")
            for i in range(50):
                await page.wait_for_timeout(1000)

                if (i + 1) % 10 == 0:
                    print(f"[3] Waiting... {i+1}s")

            print("[4] Take screenshot")
            await page.screenshot(path="html_cv_test.png", full_page=True)
            print("[4] Screenshot saved: html_cv_test.png")

            # Check for both image and text
            content = await page.content()

            # Check for text content from CV
            has_text = any(text in content for text in [
                "Abdullah",
                "Seyda",
                "Aksakal",
                "Fractional CTO",
                "Istanbul"
            ])

            # Check for image references (PNG or img tags)
            has_image = "/preview_image" in content or "<img" in content or "cv_page1" in content.lower()

            # Check for loading stub
            has_loading = "Yükleniyor" in content

            print(f"\n[RESULT] Text content found: {'YES' if has_text else 'NO'}")
            print(f"[RESULT] Image reference found: {'YES' if has_image else 'NO'}")
            print(f"[RESULT] Loading stub present: {'YES' if has_loading else 'NO'}")

            if has_text and has_image and not has_loading:
                print("\n[FINAL] ✅ TEST PASSED - Image and text both displaying!")
                return True
            elif has_text and has_image:
                print("\n[FINAL] ⚠️ TEST PARTIAL - Text and image found but loading stub still present")
                return False
            else:
                print("\n[FINAL] ❌ TEST FAILED - Missing image or text content")
                return False

        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test())
    exit(0 if result else 1)
