#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

async def test_upload():
    cv_file = Path("C:/Users/aseyd/Downloads/Abdullah_Seyda_Aksakal_CV.pdf")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            print("[STEP 1] Navigate to localhost:8000")
            await page.goto("http://localhost:8000", timeout=15000)
            await page.wait_for_load_state("networkidle")
            print("[STEP 1] OK - Page loaded")

            # Get page HTML to find button
            print("[STEP 2] Inspect page for upload button...")
            content = await page.content()

            # Find button text
            if "PDF" in content and "yükle" in content.lower():
                print("[STEP 2] OK - Found PDF/yükle button in page")

            # Try different selectors
            selectors = [
                "button:has-text('yükle')",
                "[type='file']",
                "input[type='file']",
                "label:has-text('PDF')"
            ]

            file_input = None
            for selector in selectors:
                try:
                    element = page.locator(selector)
                    count = await element.count()
                    if count > 0:
                        print(f"[STEP 2] Found with selector: {selector}")
                        file_input = element.first
                        break
                except:
                    continue

            if not file_input:
                print("[FAIL] Could not find file input element")
                print("[DEBUG] Looking for file inputs...")
                all_inputs = await page.query_selector_all("input[type='file']")
                print(f"[DEBUG] Found {len(all_inputs)} file inputs")
                if all_inputs:
                    file_input = page.locator("input[type='file']").first

            if file_input:
                print("[STEP 3] Upload file via file input")
                await file_input.set_input_files(str(cv_file))
                print(f"[STEP 3] OK - File submitted: {cv_file.name}")

                # Wait for processing
                print("[STEP 4] Wait for response (5 seconds)...")
                await page.wait_for_timeout(5000)

                # Take screenshot
                await page.screenshot(path="cv_test.png", full_page=True)
                print("[STEP 4] OK - Screenshot saved: cv_test.png")

                # Check if anything changed
                new_content = await page.content()
                if "Yükleniyor" in new_content or len(new_content) > len(content):
                    print("[SUCCESS] Page updated after upload!")
                    return True
                else:
                    print("[UNKNOWN] Page content unchanged")
                    return False
            else:
                print("[FAIL] File input not found on page")
                return False

        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test_upload())
    print(f"\n[RESULT] Test {'PASSED' if result else 'FAILED'}")
    exit(0 if result else 1)
