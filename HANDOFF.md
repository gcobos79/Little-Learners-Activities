# Little Learners Activities — Complete Project Handoff and Recreation Prompt

This document consolidates everything established in this conversation about Little Learners Activities, including the student tablets, compatibility requirements, the existing teacher interface, the planned student experience, navigation rules, restrictions, and implementation decisions.

It is designed to be copied into another ChatGPT conversation or provided to another AI developer so the project can continue without losing the requirements or accidentally rebuilding features that already exist.

One important distinction: this handoff documents the requirements, decisions, and version history available in our conversation. It does not replace the actual HTML source code. The precise implementation of existing screens, database connections, and activity behavior must be verified against the latest real project file.

# Part 1. Master prompt to continue the project

# PROJECT: LITTLE LEARNERS ACTIVITIES

## 1. Your role

Act as an experienced web application developer specializing in HTML, CSS, JavaScript, responsive interfaces, touch-screen interaction, and educational software for Pre-K students.

Continue development of an existing web application called **Little Learners Activities**. Do not assume that this is a new project. The application already has a teacher interface, an existing activity structure, and at least one previously created activity that must be preserved.

Work incrementally. Understand the existing application before changing it. Preserve all working functionality and avoid unnecessary redesigns.

The user is a bilingual Pre-K teacher who uses the application with students at school. Communicate with the user in Spanish unless the user requests another language.

## 2. Core development rules

1. Preserve the existing application and its working functionality.
2. Never delete, overwrite, or replace an existing activity simply to implement a new feature.
3. Create a new, clearly named version whenever a code change is requested.
4. Keep previous versions available as backups.
5. Do not invent missing source code, database structures, files, or application behavior.
6. Before modifying the application, inspect the latest actual HTML source file supplied by the user or available in the project.
7. If the latest version cannot be located, request that the user upload it. Do not pretend that an unverified file exists.
8. Do not claim that the application has been tested on a real tablet or in Chrome unless that test was actually performed.
9. Distinguish JavaScript syntax validation from full browser testing and real-device testing.
10. Explain changes clearly and provide a verified downloadable file when a new HTML version is actually created.
11. Do not make additional changes beyond those authorized by the user.
12. Ask a concise clarification when an essential implementation detail is unknown.

## 3. Purpose of the application

Little Learners Activities is a web-based educational application for Pre-K students.

The application has a teacher-facing interface for organizing and navigating educational activities. The planned student experience will reuse that existing activity structure while hiding teacher-only administrative controls.

The goal is to avoid duplicating the activity library. Teachers and students should work with the same underlying activity organization, but each should have an appropriate interface.

The student interface must be simple enough for young children to use on school tablets with touch input.

## 4. School tablet information

The following information was supplied by the user for the students' school tablets:

- Serial number: YX03R7P3
- MTM code: 8P2AM000EUS
- Power input: 5 V, 2 A
- Manufacturing date: February 12, 2022
- Factory ID: HQ006
- Browser: Google Chrome
- Known compatibility: Little Learners Activities V8 worked correctly on these tablets.

The exact commercial tablet model and operating system have not been conclusively identified from these details.

Do not confuse these student tablets with the classroom interactive display, which is a separate Newline Q Ultra, model TT-8626QULT-D751.

Use the known compatibility of V8 as a useful reference, but do not assume that every later version works identically.

## 5. Existing teacher interface

The teacher currently has an interface for viewing and navigating the activity structure.

The existing teacher interface includes or has included controls such as:

- Creating a new folder.
- Viewing a location indicator, including a location such as “Español.”
- Creating activities or other content through a “＋ Crear” control.
- Navigating folders and subfolders.
- Viewing activity cards.
- Accessing an activity-specific menu with options such as “Abrir,” “Editar,” and “Mover.”

The exact current layout, implementation, labels, and underlying logic must be confirmed by inspecting the latest project source. Do not reconstruct the teacher interface from assumptions when the original code is available.

The student experience should reuse this existing structure rather than create an independent copy.

## 6. Existing activity that must be preserved

There is an activity that was created previously. Currently, selecting a student's name or icon from the main student screen takes the user to that existing activity.

The user explicitly stated that this activity must not be deleted. It will be used later.

Therefore:

- Preserve the existing activity and its data.
- Do not replace it with the new student navigation screen.
- Do not remove its code or functionality.
- Do not change its behavior unless the user separately authorizes that change.
- Implement the new student navigation as a separate step in the existing flow, while retaining the previous activity for later use.

Before coding, identify exactly how the current student selection leads to the existing activity and how that route can be changed without destroying the original functionality.

## 7. New student experience: agreed behavior

When a student named Abigail reaches the main student screen and presses her name or icon, the application should open a student-facing version of the existing teacher activity browser.

This is the agreed flow:

Main student screen\
→ Abigail selects her name or icon\
→ Student activity browser opens at the top level of the activity structure\
→ Abigail navigates through folders and subfolders\
→ Abigail selects an activity\
→ The activity opens directly so she can begin working.

The application should reuse the same activity organization and cards as the teacher interface, with the restrictions described below.

## 8. Student interface requirements

### 8.1 Starting location

Every time Abigail enters the student activity browser, the application must show the top level of the activity structure.

It must not reopen at the last subfolder visited during a previous session.

The starting location should be reset when the student enters the activity browser, without deleting or changing the actual folder structure or activity data.

Clarify the correct root location from the existing implementation rather than hardcoding an assumed folder path.

### 8.2 Preserve the existing card appearance

Activity and folder cards must retain their current appearance and information.

The user explicitly confirmed that the information displayed on the cards should remain unchanged.

Do not redesign the cards, remove their current text, shrink their typography, or alter their presentation merely because the student interface has fewer administrative controls.

Only make layout changes that are necessary for the student mode, touch usability, or existing responsive behavior, and preserve the current appearance as much as possible.

### 8.3 Folder navigation

Students must be able to navigate through folders and subfolders in the same manner as the teacher currently does.

Students must be able to:

- Open a folder.
- View the contents of that folder.
- Open nested folders.
- Navigate back to a previous folder or the parent level.
- Continue browsing the activity structure.

Reuse the existing folder-navigation behavior wherever possible. Do not build a second, independent folder system.

### 8.4 Hide teacher-only controls

The student interface must not display these teacher controls:

- “Nueva carpeta.”
- The location indicator, including “Ubicación: Español.”
- “＋ Crear.”
- The per-activity administrative menu containing “Abrir,” “Editar,” and “Mover.”

Do not confuse the administrative menu's “Abrir” command with the student's normal selection of an activity. Students must still be able to select an activity card and open the activity directly.

### 8.5 Restrict administrative actions

The student interface must not allow students to create, delete, move, edit, or otherwise modify folders or activities through the student browser.

Hiding administrative controls is not sufficient if the same actions can still be triggered accidentally through another visible control or an exposed interaction path.

Implement the restriction in the application's interaction logic as appropriate to its architecture. If the application has server-side permissions or database policies, inspect those before making claims about security.

Do not change the teacher's ability to manage activities.

### 8.6 Text and descriptions on cards

The user confirmed that the existing card information should look the same, without changes.

Therefore, retain all current card information and presentation. Do not remove descriptions or explanatory text from the cards based on an earlier ambiguous interpretation of “text hidden.”

The only elements to hide are the explicitly identified teacher-only controls and any separate teacher-only text that the user identifies later.

### 8.7 Opening an activity

When a student selects an activity card, the activity should open directly so the student can begin working.

Do not introduce an intermediate information or confirmation screen unless the user explicitly requests one.

The precise behavior once an activity opens will be discussed separately. Do not invent new gameplay, evaluation, scoring, or saving behavior at this stage.

### 8.8 Activities that are not ready

Activities that are not ready for students must simply not appear in the student interface.

The user does not want unfinished activities displayed to students.

Before implementing this feature, inspect the existing activity data and determine whether a readiness or visibility field already exists. Do not assume that one does.

If the current data model has no way to distinguish activities that are ready from activities that are unfinished, propose the smallest safe addition and obtain approval before changing the data structure.

The readiness mechanism must not accidentally hide activities from the teacher.

## 9. Additional recommended usability feature

A clear, touch-friendly way to return to the main student-selection screen is recommended.

The control should be visually recognizable to Pre-K students and should not depend on browser navigation.

However, this is a recommendation, not yet a final user-approved specification. Confirm the placement, label, and behavior with the user before implementing it.

Similarly, any proposed student-name label, publication workflow, or additional student-facing feature must be discussed before adding it.

## 10. Touch-screen and browser compatibility

The application is intended to be used through Google Chrome on the students' school tablets.

When implementing or modifying the student browser:

- Make folder and activity cards easy to tap.
- Avoid hover-only functionality.
- Ensure that controls respond to touch input.
- Avoid accidental administrative actions.
- Preserve readable text and the existing card design.
- Ensure the interface fits the tablet screen and can handle different viewport dimensions.
- Check that nested folder navigation and back controls work.
- Check that activity selection works without a mouse.
- Check audio behavior where applicable.
- Avoid relying on unverified device capabilities.

V8 is known to have worked on these tablets. This does not establish that the current version or every future version has been tested on them.

## 11. Architecture and persistence

The project has used browser-based HTML and JavaScript, and Supabase has been used in some Little Learners versions. Different prototypes may use different persistence approaches.

Do not assume that the latest activity browser uses a particular database, table, authentication method, or storage mechanism without inspecting the actual source.

Before coding, determine:

- Where the folder structure is stored.
- Where activity definitions are stored.
- How activities are opened.
- How teacher permissions or teacher-only modes are represented.
- Whether student selection is stored in application state, a URL, or another mechanism.
- Whether data is loaded from Supabase, browser storage, or another source.
- How unfinished activities can be distinguished from published activities, if that concept already exists.

Preserve the current persistence behavior. Do not migrate, reset, overwrite, or delete data merely to implement the student mode.

## 12. Implementation plan

Work through these stages in order.

### Stage 1: Inspect the source

Obtain and inspect the latest real HTML source and related files.

Map the existing screens, student-selection handler, teacher activity browser, folder navigation, activity-launch logic, and persistence.

Identify the existing activity that must remain intact.

### Stage 2: Plan the smallest safe change

Explain how the student selection will open the student browser rather than immediately entering the previously created activity.

Keep the previous activity available for later use.

Reuse the existing activity browser, adapting its presentation and available actions based on whether the current user is a teacher or student.

### Stage 3: Implement student mode

Apply the agreed requirements:

- Open the activity browser at the root each time.
- Retain the existing folder and activity cards.
- Keep card information unchanged.
- Allow folder navigation.
- Hide teacher-only controls.
- Prevent student-side administrative changes.
- Open selected activities directly.
- Exclude unfinished activities from the student view, using an existing readiness mechanism if available.

Do not implement unapproved additional features.

### Stage 4: Preserve and version

Save the result as a new version with a clear, sequential version number and descriptive filename.

Never overwrite the previous working version or the original activity.

If the actual latest version cannot be found, stop and request the correct source file.

### Stage 5: Validate

Perform the checks that are actually possible:

1. Validate JavaScript syntax.
2. Check that required HTML elements and event handlers are present.
3. Test folder navigation and root reset if a browser test environment is available.
4. Verify that student mode does not expose teacher-only controls.
5. Verify that selecting an activity launches it directly.
6. Verify that the existing activity remains available.
7. Verify that unfinished activities are excluded when the readiness mechanism is implemented.
8. Test touch behavior and audio on a real school tablet when available.

Report which checks were performed and which still require manual testing.

Do not claim that real-device compatibility has been confirmed unless it has been tested.

## 13. Decisions that are still open

Do not make assumptions about these items:

- The exact gameplay, evaluation, scoring, and result-saving behavior after an activity opens.
- How an activity is marked as ready or unfinished if the existing source has no such field.
- The final design and location of a return-to-student-selection control.
- Any additional teacher-only text not already specified.
- The precise source version to modify, until its file is located and verified.

## 14. Immediate next step

Before writing code, obtain the latest real project HTML file and inspect it.

Then explain briefly, in Spanish, how the student mode can be integrated into the existing application while preserving the previously created activity and the current teacher functionality.

Wait for the user's authorization before implementing changes if the user has not explicitly asked you to begin coding.

The priority is to preserve working functionality, reuse the existing activity structure, and build a simple student browsing experience without compromising the teacher interface.

# Part 2. Existing project history and technical context

The following information provides additional context for another AI so it does not confuse the student-mode redesign with earlier features of the application.

## A. Version history relevant to the project

The broader Little Learners Activities project has gone through multiple iterations. The following are features documented in the available project history, not a guarantee that every feature exists in the latest source file.

| Version   | Previously documented feature                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| V8        | Worked correctly on the students' school tablets.                                                                                         |
| V101      | Allowed a question's visible text to be blank when alternate spoken text or an audio file was configured.                                 |
| V109      | Documented practice-versus-evaluation feedback: practice can reveal the correct answer after a wrong response, while evaluation does not. |
| V112      | Added a magical, fairy-wand-like sound for correct answers and a lower-pitched wrong-answer sound.                                        |
| V113      | Added a “Carpeta anterior” navigation card for returning to the parent folder.                                                            |
| V114      | Intended to fix a blank-screen problem after switching between teacher screens.                                                           |
| V115–V116 | Adjusted the activity header, sound control, return control, and responsive layout.                                                       |
| V117–V118 | Changed the incorrect-answer sound to a descending sound and then a recognizable game-show-style buzzer.                                  |
| V119      | Set the wrong-answer buzzer duration to approximately one second.                                                                         |
| V120      | Set the wrong-answer buzzer duration to approximately 1.5 seconds.                                                                        |

Important: V120 is the latest version documented in the available conversation history, but its actual HTML file has not been verified here. Do not assume it is the correct source for the next modification until the file is located and inspected.

Earlier versions and the stable copies must remain untouched.

## B. What has actually been decided for the new student mode?

Confirmed

Reuse the teacher's existing activity browser and folder structure; start at the root; preserve card appearance and information; allow folder navigation; open activities directly; hide teacher controls; do not list unfinished activities; preserve the previous activity.

Not yet implemented or verified

The student-mode transition, the readiness/publishing mechanism, and the final behavior after launching an activity. The actual source code must be inspected to establish the current implementation.

## C. The central design principle

The new experience should not be a second, independent activity library.

It should be the same library, presented in two modes:

Shared activity structure

Existing folders, subfolders, cards, and activity definitions

Teacher mode

Manage content, create folders, edit or move activities, and organize the library.

Student mode

Browse available activities, navigate folders, and open an activity to work.

This approach minimizes duplicated code, reduces the risk of inconsistent activity data, and makes teacher-created changes available through the same underlying structure.

## D. How to use this handoff in another AI conversation

1. Copy the master prompt in Part 1.
2. Attach the latest actual HTML file for Little Learners Activities. If the application depends on other files, include those too.
3. Ask the AI to inspect the source and explain the proposed changes before editing.
4. Require a new versioned file and preservation of the previous version.
5. Test the resulting version in Chrome, then on the actual school tablets.

The prompt explains the agreed requirements and design decisions. The source file is still necessary to reproduce the actual application, including its precise appearance, internal logic, and data connections.