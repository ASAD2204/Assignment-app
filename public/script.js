document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const assignmentForm = document.getElementById('assignmentForm');
    const classForm = document.getElementById('classForm');
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

    function toggleFields() {
        const role = document.getElementById('role')?.value;
        const studentFields = document.getElementById('studentFields');
        const signupButton = signupForm?.querySelector('button');
        const status = document.getElementById('signupStatus');

        if (!studentFields) return;

        if (role === 'student') {
            studentFields.style.display = 'block';
            fetch(`${API_BASE_URL}/api/classes`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
                    return res.json();
                })
                .then(classes => {
                    const classIdSelect = document.getElementById('classId');
                    classIdSelect.innerHTML = '<option value="">Select a class</option>';
                    if (classes.length === 0) {
                        classIdSelect.disabled = true;
                        signupButton.disabled = true;
                        status.textContent = 'No classes available. Wait for a teacher to create one.';
                        status.style.color = 'red';
                    } else {
                        classIdSelect.disabled = false;
                        signupButton.disabled = false;
                        status.textContent = '';
                        classes.forEach(cls => {
                            const option = document.createElement('option');
                            option.value = cls._id;
                            option.textContent = `${cls.name} (${cls.code})`;
                            classIdSelect.appendChild(option);
                        });
                    }
                })
                .catch(err => {
                    console.error('Error fetching classes:', err);
                    status.textContent = 'Error loading classes. Check server connection.';
                    status.style.color = 'red';
                });
        } else {
            studentFields.style.display = 'none';
            signupButton.disabled = false;
            status.textContent = '';
        }
    }

    if (signupForm && document.getElementById('role')) {
        document.getElementById('role').addEventListener('change', toggleFields);
        toggleFields();

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const role = document.getElementById('role').value;
            const studentID = role === 'student' ? document.getElementById('studentID').value : undefined;
            const classId = role === 'student' ? document.getElementById('classId').value : undefined;
            const status = document.getElementById('signupStatus');

            if (role === 'student' && (!studentID || !classId || classId === '')) {
                status.textContent = 'Student ID and Class are required.';
                status.style.color = 'red';
                return;
            }

            const payload = { username, password, role };
            if (role === 'student') {
                payload.studentID = studentID;
                payload.classId = classId;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await response.json();

                if (response.ok) {
                    status.textContent = 'Signup successful! Redirecting...';
                    status.style.color = '#00897b';
                    setTimeout(() => window.location.href = 'index.html', 2000);
                } else {
                    status.textContent = data.message;
                    status.style.color = 'red';
                }
            } catch (error) {
                console.error('Signup fetch error:', error);
                status.textContent = 'Network error. Check server connection.';
                status.style.color = 'red';
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role').value;
            const status = document.getElementById('loginStatus');

            try {
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role }),
                });
                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('currentUser', JSON.stringify(data));
                    window.location.href = role === 'student' ? 'student.html' : 'teacher.html';
                } else {
                    status.textContent = data.message;
                    status.style.color = 'red';
                }
            } catch (error) {
                console.error('Login fetch error:', error);
                status.textContent = 'Network error. Check server connection.';
                status.style.color = 'red';
            }
        });
    }

    if (document.getElementById('assignmentList') && currentUser?.role === 'student') {
        if (!currentUser.classId || !currentUser.classId._id) {
            console.error('Invalid classId in currentUser:', currentUser);
            document.getElementById('assignmentList').innerHTML = '<p>Error: No class assigned. Contact support.</p>';
            return;
        }

        document.getElementById('studentName').textContent = currentUser.username;
        document.getElementById('className').textContent = currentUser.classId.name;

        Promise.all([
            fetch(`${API_BASE_URL}/api/assignments?classId=${currentUser.classId._id}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch assignments: ${res.status}`);
                return res.json();
            }),
            fetch(`${API_BASE_URL}/api/submissions/student/${currentUser.username}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`);
                return res.json();
            })
        ]).then(([assignments, submissions]) => {
            const assignmentList = document.getElementById('assignmentList');
            if (!assignments || assignments.length === 0) {
                assignmentList.innerHTML = '<p>No assignments yet.</p>';
            } else {
                assignments.forEach(assignment => {
                    const hasSubmitted = submissions.some(sub => sub.assignmentId._id === assignment._id);
                    const card = document.createElement('div');
                    card.className = 'assignment-card';
                    if (new Date(assignment.deadline) - new Date() < 24 * 60 * 60 * 1000) {
                        card.classList.add('deadline-near');
                        card.innerHTML += '<span class="warning">Due soon!</span>';
                    }
                    card.innerHTML = `
                        <div>
                            <strong>${assignment.topic}</strong>${hasSubmitted ? '<span class="badge">Submitted</span>' : ''}<br>
                            Deadline: ${new Date(assignment.deadline).toLocaleString()}
                        </div>
                        <form class="submitForm" data-assignment-id="${assignment._id}">
                            <input type="file" name="assignmentFile" accept=".pdf" required>
                            <button type="submit">${hasSubmitted ? 'Edit' : 'Submit'}</button>
                        </form>
                    `;
                    assignmentList.appendChild(card);
                });

                document.querySelectorAll('.submitForm').forEach(form => {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const assignmentId = form.getAttribute('data-assignment-id');
                        const formData = new FormData();
                        formData.append('assignmentFile', form.querySelector('input[type="file"]').files[0]);
                        formData.append('studentID', currentUser.studentID);
                        formData.append('username', currentUser.username);
                        formData.append('assignmentId', assignmentId);
                        formData.append('classId', currentUser.classId._id);

                        console.log('Submitting form data:', {
                            studentID: currentUser.studentID,
                            username: currentUser.username,
                            assignmentId,
                            classId: currentUser.classId._id
                        });

                        form.querySelector('button').innerHTML = 'Uploading...';
                        try {
                            const response = await fetch(`${API_BASE_URL}/api/submit`, {
                                method: 'POST',
                                body: formData,
                            });
                            const data = await response.json();
                            if (!response.ok) throw new Error(data.message || 'Submission failed');
                            alert(data.message);
                            window.location.reload();
                        } catch (error) {
                            console.error('Submission error:', error);
                            alert(`Failed to submit assignment: ${error.message}`);
                        } finally {
                            form.querySelector('button').innerHTML = form.querySelector('input[type="file"]').value ? 'Edit' : 'Submit';
                        }
                    });
                });
            }

            const submissionList = document.getElementById('submissionList');
            if (!submissions || submissions.length === 0) {
                submissionList.innerHTML = '<p>No submissions yet.</p>';
            } else {
                submissions.forEach(sub => {
                    const item = document.createElement('div');
                    item.className = 'submission-item';
                    const fileName = sub.filePath ? sub.filePath.split('/').pop() || 'unknown.pdf' : 'Missing File';
                    item.innerHTML = `
                        <span>${sub.assignmentId.topic} - ${new Date(sub.date).toLocaleString()}</span>
                        <div>
                            <span>${fileName}</span>
                            ${sub.filePath ? `<button class="preview-btn" data-file="${sub.filePath}">Preview</button>` : '<span>No file</span>'}
                        </div>
                    `;
                    submissionList.appendChild(item);
                });

                document.querySelectorAll('.preview-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const filePath = btn.getAttribute('data-file');
                        if (filePath) window.open(filePath, '_blank');
                    });
                });
            }
        }).catch(err => {
            console.error('Student dashboard error:', err);
            document.getElementById('assignmentList').innerHTML = '<p>Error loading assignments: ' + err.message + '</p>';
        });
    }

    // Teacher Dashboard
    if (classForm || assignmentForm) {
        if (!currentUser || currentUser.role !== 'teacher') {
            window.location.href = 'index.html';
            return;
        }

        if (classForm) {
            classForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('className').value;
                const code = document.getElementById('classCode').value;
                const status = document.getElementById('classStatus');

                try {
                    const response = await fetch(`${API_BASE_URL}/api/classes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, code, createdBy: currentUser.username }),
                    });
                    const data = await response.json();

                    if (response.ok) {
                        status.textContent = `Class created! Code: ${data.class.code}`;
                        status.style.color = '#00897b';
                        classForm.reset();
                        loadClasses();
                    } else {
                        status.textContent = data.message;
                        status.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Class creation error:', error);
                    status.textContent = 'Server error: ' + error.message;
                    status.style.color = 'red';
                }
            });
        }

        function loadClasses() {
            fetch(`${API_BASE_URL}/api/classes/teacher/${currentUser.username}`)
                .then(res => {
                    if (!res.ok) throw new Error(`Failed to fetch classes: ${res.status}`);
                    return res.json();
                })
                .then(classes => {
                    const classList = document.getElementById('classList');
                    classList.innerHTML = '';
                    const classIdSelect = document.getElementById('classId');
                    classIdSelect.innerHTML = '<option value="">Select a class</option>';
                    classes.forEach(cls => {
                        const item = document.createElement('div');
                        item.className = 'class-item';
                        item.innerHTML = `
                            <span><strong>${cls.name}</strong> (Code: ${cls.code})</span>
                            <div>
                                <button onclick="loadAssignments('${cls._id}')">View Assignments</button>
                                <button onclick="deleteClass('${cls._id}')">Delete Class</button>
                            </div>
                        `;
                        classList.appendChild(item);

                        const option = document.createElement('option');
                        option.value = cls._id;
                        option.textContent = cls.name;
                        classIdSelect.appendChild(option);
                    });
                }).catch(err => {
                    console.error('Error loading classes:', err);
                });
        }
        loadClasses();

        window.deleteClass = function(classId) {
            if (confirm('Are you sure you want to delete this class and all its assignments/submissions?')) {
                fetch(`${API_BASE_URL}/api/classes/${classId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ createdBy: currentUser.username })
                })
                .then(res => {
                    if (!res.ok) throw new Error(`Failed to delete class: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    alert(data.message);
                    loadClasses();
                })
                .catch(err => {
                    console.error('Delete class error:', err);
                    alert('Failed to delete class: ' + err.message);
                });
            }
        };

        if (assignmentForm) {
            assignmentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const classId = document.getElementById('classId').value;
                const topic = document.getElementById('topic').value;
                const deadline = document.getElementById('deadline').value;
                const status = document.getElementById('assignmentStatus');

                try {
                    const response = await fetch(`${API_BASE_URL}/api/assignments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ topic, deadline, classId, createdBy: currentUser.username }),
                    });
                    const data = await response.json();

                    if (response.ok) {
                        status.textContent = data.message;
                        status.style.color = '#00897b';
                        assignmentForm.reset();
                        loadClasses();
                    } else {
                        status.textContent = data.message;
                        status.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Assignment creation error:', error);
                    status.textContent = 'Server error: ' + error.message;
                    status.style.color = 'red';
                }
            });
        }
    }

    // Class Assignments Page
    if (document.getElementById('className') && window.location.pathname.includes('class-assignments.html')) {
        if (!currentUser || currentUser.role !== 'teacher') {
            window.location.href = 'index.html';
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const classId = urlParams.get('classId');

        if (!classId) {
            document.getElementById('className').textContent = 'Error: No class specified';
            return;
        }

        Promise.all([
            fetch(`${API_BASE_URL}/api/classes/teacher/${currentUser.username}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch classes: ${res.status}`);
                return res.json();
            }),
            fetch(`${API_BASE_URL}/api/assignments?classId=${classId}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch assignments: ${res.status}`);
                return res.json();
            }),
            fetch(`${API_BASE_URL}/api/students/${classId}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch students: ${res.status}`);
                return res.json();
            })
        ]).then(([classes, assignments, students]) => {
            const classObj = classes.find(c => c._id === classId);
            if (!classObj) {
                document.getElementById('className').textContent = 'Class not found';
                return;
            }

            document.getElementById('className').textContent = classObj.name;

            const assignmentList = document.getElementById('assignmentList');
            if (!assignments || assignments.length === 0) {
                assignmentList.innerHTML = '<p>No assignments yet.</p>';
            } else {
                assignments.forEach(assignment => {
                    const card = document.createElement('div');
                    card.className = 'assignment-card';
                    card.innerHTML = `
                        <div>
                            <strong>${assignment.topic}</strong><br>
                            Deadline: ${new Date(assignment.deadline).toLocaleString()}
                        </div>
                        <div>
                            <button onclick="viewSubmissions('${assignment._id}')">View Submissions</button>
                            <button onclick="downloadSubmissions('${assignment._id}')">Download Submissions</button>
                        </div>
                    `;
                    assignmentList.appendChild(card);
                });
            }

            const studentList = document.createElement('div');
            studentList.innerHTML = '<h2>Registered Students</h2>';
            if (!students || students.length === 0) {
                studentList.innerHTML += '<p>No students registered yet.</p>';
            } else {
                const table = document.createElement('table');
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Student ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(student => `
                            <tr>
                                <td>${student.username}</td>
                                <td>${student.studentID}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                `;
                studentList.appendChild(table);
            }
            document.querySelector('.container').appendChild(studentList);
        }).catch(err => {
            console.error('Class assignments error:', err);
            document.getElementById('className').textContent = 'Error loading class assignments: ' + err.message;
        });
    }

    // Assignment Detail Page
    if (document.getElementById('assignmentTopic')) {
        if (!currentUser || currentUser.role !== 'teacher') {
            window.location.href = 'index.html';
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const assignmentId = urlParams.get('assignmentId');

        if (!assignmentId) {
            document.getElementById('assignmentTopic').textContent = 'Error: No assignment specified';
            return;
        }

        Promise.all([
            fetch(`${API_BASE_URL}/api/assignments`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch assignments: ${res.status}`);
                return res.json();
            }),
            fetch(`${API_BASE_URL}/api/submissions/assignment/${assignmentId}`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`);
                return res.json();
            })
        ]).then(([assignments, submissions]) => {
            const assignment = assignments.find(a => a._id === assignmentId);
            if (!assignment) {
                document.getElementById('assignmentTopic').textContent = 'Assignment not found';
                return;
            }

            document.getElementById('assignmentTopic').textContent = assignment.topic;
            document.getElementById('assignmentDeadline').textContent = new Date(assignment.deadline).toLocaleString();

            const submissionList = document.getElementById('submissionList');
            if (!submissions || submissions.length === 0) {
                submissionList.innerHTML = '<tr><td colspan="4">No submissions yet.</td></tr>';
            } else {
                submissions.forEach(sub => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${sub.username}</td>
                        <td>${sub.studentID}</td>
                        <td><img src="assets/pdf-icon.png" class="pdf-icon" data-file="${sub.filePath || ''}" alt="PDF"></td>
                        <td>${new Date(sub.date).toLocaleString()}</td>
                    `;
                    submissionList.appendChild(tr);
                });

                document.querySelectorAll('.pdf-icon').forEach(icon => {
                    icon.addEventListener('click', () => {
                        const filePath = icon.getAttribute('data-file');
                        if (filePath) window.open(filePath, '_blank');
                    });
                });
            }
        }).catch(err => {
            console.error('Assignment detail error:', err);
            document.getElementById('assignmentTopic').textContent = 'Error loading assignment details: ' + err.message;
        });
    }

    const logoutLinks = document.querySelectorAll('#logout');
    logoutLinks.forEach(link => {
        link.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        });
    });
});

// Helper functions
function loadAssignments(classId) {
    window.location.href = `class-assignments.html?classId=${classId}`;
}

function viewSubmissions(assignmentId) {
    window.location.href = `assignment-detail.html?assignmentId=${assignmentId}`;
}

function downloadSubmissions(assignmentId) {
    window.location.href = `${window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''}/api/download-submissions/${assignmentId}`;
}