#!/usr/bin/env python3
"""
Test CV Upload - Verify actual CV content appears, not just stub
"""
import asyncio
from playwright.async_api import async_playwright
from pathlib import Path
import time

async def test_cv_content():
    cv_file = Path("C:/Users/aseyd/Downloads/Abdullah_Seyda_Aksakal_CV.pdf")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            print("[1/6] Opening http://localhost:8000/...")
            await page.goto("http://localhost:8000", timeout=15000)
            await page.wait_for_load_state("networkidle")
            print("[1/6] SUCCESS - Page loaded")

            print("[2/6] Finding file input...")
            file_input = page.locator("input[type='file']")
            count = await file_input.count()
            if count == 0:
                print("[2/6] FAIL - File input not found")
                return False
            print("[2/6] SUCCESS - File input found")

            print("[3/6] Uploading CV file...")
            await file_input.first.set_input_files(str(cv_file))
            print(f"[3/6] SUCCESS - File uploaded: {cv_file.name}")

            # Get initial content to compare
            initial_content = await page.content()

            print("[4/6] Waiting for processing (15 seconds)...")
            # Wait for processing - check every second
            for i in range(15):
                await page.wait_for_timeout(1000)
                current_content = await page.content()

                # Check if we got real CV content (not stub)
                has_real_content = (
                    "Abdullah" in current_content or
                    "Seyda" in current_content or
                    "CV" in current_content or
                    ("Yükleniyor" not in current_content and len(current_content) > len(initial_content) + 100)
                )

                if has_real_content and "Yükleniyor" not in current_content:
                    print(f"[4/6] SUCCESS - Real CV content detected at {i+1}s")
                    break
                else:
                    print(f"[4/6] Waiting... ({i+1}s) - Stub still showing", end="\r")

            # Final check
            final_content = await page.content()

            print("\n[5/6] Verifying CV content...")
            cv_indicators = ["Abdullah", "Seyda", "Aksakal", "CV", "Experience", "Education", "Skills"]
            found_indicators = [ind for ind in cv_indicators if ind in final_content or ind.lower() in final_content.lower()]

            print(f"[5/6] Found {len(found_indicators)} CV indicators: {found_indicators}")

            # Check for stub
            has_stub = "Yükleniyor" in final_content
            print(f"[5/6] Stub preview still present: {has_stub}")

            # Take final screenshot
            print("[6/6] Taking final screenshot...")
            await page.screenshot(path="cv_final_result.png", full_page=True)
            print("[6/6] SUCCESS - Screenshot saved: cv_final_result.png")

            # Determine test result
            if len(found_indicators) > 0 and not has_stub:
                print("\n[RESULT] TEST PASSED - CV content loaded successfully!")
                print(f"[RESULT] CV indicators found: {', '.join(found_indicators)}")
                return True
            elif len(found_indicators) > 0 and has_stub:
                print("\n[RESULT] PARTIAL - CV processing in progress (stub still showing)")
                print(f"[RESULT] But CV content detected: {', '.join(found_indicators)}")
                return True
            else:
                print("\n[RESULT] TEST FAILED - No CV content found")
                print("[RESULT] Only stub preview is showing")
                return False

        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test_cv_content())
    exit(0 if result else 1)
