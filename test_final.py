#!/usr/bin/env python3
"""Final CV upload test - verify PNG displays"""
import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

async def test():
    cv_file = Path("C:/Users/aseyd/Downloads/Abdullah_Seyda_Aksakal_CV.pdf")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            print("[1] Navigate to localhost:8000")
            await page.goto("http://localhost:8000", timeout=15000)
            await page.wait_for_load_state("networkidle")

            print("[2] Find and click file input")
            file_input = page.locator("input[type='file']")
            await file_input.first.set_input_files(str(cv_file))
            print(f"[2] Uploaded: {cv_file.name}")

            print("[3] Wait for PNG creation (40 seconds)...")
            # Wait a long time for the background thread to finish
            for i in range(40):
                await page.wait_for_timeout(1000)
                content = await page.content()

                # Check if PNG endpoint is being used
                if "/preview_image" in content or ("cv_page1" in content.lower() and "Yükleniyor" not in content):
                    print(f"[3] CV content detected at {i+1}s - PNG endpoint found!")
                    break

                if (i + 1) % 10 == 0:
                    print(f"[3] Still processing... {i+1}s")

            # Take screenshot
            print("[4] Take screenshot")
            await page.screenshot(path="final_cv.png", full_page=True)
            print("[4] Screenshot saved: final_cv.png")

            # Check final state
            final_content = await page.content()
            has_cv = "Abdullah" in final_content or "Seyda" in final_content
            has_loading = "Yükleniyor" in final_content

            print(f"\n[RESULT] CV content: {'YES' if has_cv else 'NO'}")
            print(f"[RESULT] Still loading: {'YES' if has_loading else 'NO'}")

            if has_cv and not has_loading:
                print("[FINAL] TEST PASSED - CV loaded and displayed!")
                return True
            else:
                print("[FINAL] TEST INCONCLUSIVE")
                return False

        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test())
    exit(0 if result else 1)
