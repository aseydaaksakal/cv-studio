ThrottleStop 9.7.3
2025 Mar 29

- add Per Core adjustment for 12th Gen and newer CPUs.
- add separate P core and E core reporting to the log file.  
- open the TPL window to the same profile as the current profile.

ThrottleStop 9.7.2
2025 Jan 3

- saving of the PROCHOT Offset Lock status is fixed.
- added Arrow Lake beta support. 

ThrottleStop 9.7.1
2024 Dec 29

- remove the max multiplier code from the Lock MMIO function.

ThrottleStop 9.7
2024 Dec 24

- added per profile adjustment of the turbo power limits, Speed Shift Min Max and PROCHOT offset values.
- added core and cache V/F tuning to the FIVR window for unlocked 10th Gen and newer HX and K series CPUs. 
- fixed the Notification Area icons for improved Windows 11 compatibility. 
- fixed the power plan selector and increased the number of selections from 8 to 12.
- BD PROCHOT is now automatically locked when it is disabled.
- changed the DDR memory speed monitoring method. 
- added an option so the Safe Start feature can be toggled on or off.  


ThrottleStop Windows 11 Compatibility
-------------------------------------
Use the Windows High Performace power plan when using the ThrottleStop Speed Shift settings.

Windows 11 Virtualization Based Security (core isolation memory integrity) needs to be disabled to provide ThrottleStop with direct access to the FIVR voltage control register.

https://beebom.com/how-disable-virtualization-based-security-vbs-windows-11/
https://www.makeuseof.com/windows-11-disable-vbs/

Kevin Glynn
throttlestop@shaw.ca
