// adminRoutes.js
import express from 'express';
import Student from '../model/Student.js';
import Instructor from '../model/Instructor.js';
import authenticateToken from '../middleware/authenticateToken.js';
import AdviserRequest from '../model/AdviserRequest.js';
import Research from '../model/Research.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Admin from '../model/Admin.js';
import { io } from '../src/app.js'; // Import io instance
import ExcelJS from 'exceljs';
import PDFGenerator from '../services/pdfGeneration.js';
import { checkPermission, checkAnyPermission } from '../middleware/checkPermission.js';
import { ADMIN_PERMISSIONS } from '../model/Admin.js';

const adminRoutes = express.Router();

// Add state for tracking edit mode
let currentEditor = null;

adminRoutes.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Admin login attempt:', email);

        // Check for superadmin credentials with detailed logging
        if (email === 'superadmin@buksu.edu.ph') {
            console.log('Superadmin login attempt detected');
            
            // Add salting verification here
            const salt = await bcrypt.genSalt(10);
            const testHash = await bcrypt.hash(password, salt);
            
            console.log('\n=== SALTING VERIFICATION ===');
            console.log('Password being hashed:', password);
            console.log('Generated Salt:', salt);
            console.log('Generated Hash:', testHash);
            console.log('Salt Rounds Used:', testHash.split('$')[2]);
            console.log('Hash Format:', testHash.split('$')[1]);
            console.log('Is Properly Hashed:', testHash.startsWith('$2b$'));
            console.log('===========================\n');

            if (password === 'BuksuSuperAdmin2024') {
                console.log('Original superadmin verification successful');
                
                // Also test the hashed version if hash exists
                const storedHash = process.env.SUPERADMIN_PASSWORD_HASH;
                console.log('Salting Process Check:', {
                    attemptedPassword: password,
                    storedHashExists: !!storedHash,
                    storedHashValue: storedHash ? `${storedHash.substring(0, 10)}...` : 'none',
                    saltingPattern: storedHash ? storedHash.split('$')[2] : 'none'
                });

                if (storedHash) {
                    try {
                        const hashMatch = await bcrypt.compare(password, storedHash);
                        console.log('Bcrypt Verification Details:', {
                            hashComparisonPerformed: true,
                            hashMatchResult: hashMatch,
                            hashFormat: storedHash.startsWith('$2b$') ? 'valid' : 'invalid',
                            saltRounds: storedHash.split('$')[2]
                        });
                    } catch (bcryptError) {
                        console.log('Hash Verification Error:', {
                            error: bcryptError.message,
                            hashFormat: storedHash ? storedHash.substring(0, 10) : 'invalid',
                            attemptedComparison: true
                        });
                    }
                }

                const token = jwt.sign(
                    { 
                        role: 'superadmin',
                        email: email 
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );

                return res.status(200).json({
                    success: true,
                    token,
                    role: 'superadmin',
                    name: 'Super Administrator',
                    message: 'Superadmin login successful'
                });
            }
            
            console.log('Superadmin verification failed');
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Regular admin login with bcrypt
        const admin = await Admin.findOne({ email });
        console.log('Found admin:', admin);
        
        if (!admin) {
            console.log('No admin found with email:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if admin is active
        if (!admin.isActive) {
            console.log('Inactive admin attempted to login:', email);
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact the super administrator.'
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        
        if (!isMatch) {
            console.log('Invalid password for admin:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: admin._id,
                role: admin.role,
                email: admin.email,
                permissions: admin.permissions
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.status(200).json({
            success: true,
            token,
            role: admin.role,
            name: admin.name,
            permissions: admin.permissions,
            message: 'Login successful'
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

adminRoutes.post('/create-initial-admin', async (req, res) => {
    try {
        const adminExists = await Admin.findOne({ email: process.env.INITIAL_ADMIN_EMAIL });
        
        if (adminExists) {
            return res.status(400).json({
                success: false,
                message: 'Admin already exists'
            });
        }

        const admin = new Admin({
            name: 'Administrator',
            email: process.env.INITIAL_ADMIN_EMAIL,
            password: process.env.INITIAL_ADMIN_PASSWORD,
            uid: Date.now().toString(), // Generate a unique ID
            role: 'admin'
        });

        await admin.save();

        res.status(201).json({
            success: true,
            message: 'Initial admin account created successfully'
        });

    } catch (error) {
        console.error('Error creating initial admin:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating admin account'
        });
    }
});

adminRoutes.get('/accounts/students', authenticateToken, async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

adminRoutes.get('/accounts/students/:id', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    
    res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ message: 'Error fetching student' });
  }
});

adminRoutes.get('/accounts/instructors', authenticateToken, async (req, res) => {
  try {
    const instructors = await Instructor.find();
    res.status(200).json(instructors);
  } catch (error) {
    console.error('Error fetching instructors:', error);
    res.status(500).json({ message: 'Error fetching instructors' });
  }
});

adminRoutes.get('/accounts/instructors/:id', authenticateToken, async (req, res) => {
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

    res.status(200).json(instructor);
  } catch (error) {
    console.error('Error fetching instructor:', error);
    res.status(500).json({ message: 'Error fetching instructor' });
  }
});

adminRoutes.put('/accounts/students/:id/archive', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { archived: true },
      { new: true }
    );
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.status(200).json(student);
  } catch (error) {
    console.error('Error archiving student:', error);
    res.status(500).json({ message: 'Error archiving student' });
  }
});

adminRoutes.put('/accounts/instructors/:id/archive', authenticateToken, async (req, res) => {
  try {
    const instructor = await Instructor.findByIdAndUpdate(
      req.params.id,
      { archived: true },
      { new: true }
    );
    
    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' });
    }
    
    res.status(200).json(instructor);
  } catch (error) {
    console.error('Error archiving instructor:', error);
    res.status(500).json({ message: 'Error archiving instructor' });
  }
});

adminRoutes.put('/accounts/students/:id/restore', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { archived: false },
      { new: true }
    );
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.status(200).json(student);
  } catch (error) {
    console.error('Error restoring student:', error);
    res.status(500).json({ message: 'Error restoring student' });
  }
});

adminRoutes.put('/accounts/instructors/:id/restore', authenticateToken, async (req, res) => {
  try {
    const instructor = await Instructor.findByIdAndUpdate(
      req.params.id,
      { archived: false },
      { new: true }
    );
    
    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' });
    }
    
    res.status(200).json(instructor);
  } catch (error) {
    console.error('Error restoring instructor:', error);
    res.status(500).json({ message: 'Error restoring instructor' });
  }
});

adminRoutes.get('/adviser-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await AdviserRequest.find()
      .sort({ createdAt: -1 });
    
    const totalInstructors = await Instructor.countDocuments();
    const totalAdvisers = await Instructor.countDocuments({ role: 'adviser' });
    const pendingRequests = await AdviserRequest.countDocuments({ status: 'pending' });

    res.status(200).json({
      requests,
      stats: {
        totalInstructors,
        totalAdvisers,
        pendingRequests
      }
    });
  } catch (error) {
    console.error('Error fetching adviser requests:', error);
    res.status(500).json({ message: 'Error fetching requests' });
  }
});

adminRoutes.put('/adviser-requests/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const request = await AdviserRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (status === 'approved') {
      // Find the instructor first
      const instructor = await Instructor.findById(request.instructor);
      if (!instructor) {
        return res.status(404).json({ message: 'Instructor not found' });
      }

      // Update instructor role - Fix for role update
      if (typeof instructor.role === 'string') {
        // If role is a string, convert to array
        instructor.role = ['instructor', 'adviser'];
      } else if (Array.isArray(instructor.role)) {
        // If role is already an array, add 'adviser' if not present
        if (!instructor.role.includes('adviser')) {
          instructor.role.push('adviser');
        }
      }

      // Save instructor with new role
      await instructor.save();
      console.log('Updated instructor roles:', instructor.role); // Debug log

      // Update research with the new adviser
      const research = await Research.findByIdAndUpdate(
        request.research,
        { adviser: request.instructor },
        { new: true }
      );

      if (!research) {
        return res.status(404).json({ message: 'Research not found' });
      }

      // Reject other pending requests for this research
      await AdviserRequest.updateMany(
        { 
          research: request.research, 
          _id: { $ne: id },
          status: 'pending'
        },
        { status: 'rejected' }
      );
    }

    // Update the request status
    request.status = status;
    await request.save();

    // Send success response with updated data
    res.status(200).json({ 
      message: `Request ${status} successfully`,
      request: await AdviserRequest.findById(id).populate('instructor')
    });

  } catch (error) {
    console.error('Error updating adviser request:', error);
    res.status(500).json({ 
      message: 'Error updating request',
      error: error.message 
    });
  }
});

// Add these updated endpoints to your adminRoutes.js

// Get user counts and stats
adminRoutes.get('/user-counts', authenticateToken, async (req, res) => {
  try {
    // Get basic counts
    const students = await Student.countDocuments();
    const instructors = await Instructor.countDocuments();
    const totalUsers = students + instructors;

    console.log('User counts:', { students, instructors, totalUsers }); // Debug log

    res.json({
      success: true,
      students,
      instructors,
      totalUsers,
      activeUsers: totalUsers // For now, assuming all users are active
    });

  } catch (error) {
    console.error('Error fetching user counts:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user counts',
      error: error.message 
    });
  }
});

// Get research stats
adminRoutes.get('/activity-stats', authenticateToken, async (req, res) => {
  try {
    // Get research counts by status
    const totalSubmissions = await Research.countDocuments();
    const pendingSubmissions = await Research.countDocuments({ status: 'Pending' });
    const approvedSubmissions = await Research.countDocuments({ status: 'Accepted' });
    const rejectedSubmissions = await Research.countDocuments({ status: 'Rejected' });

    console.log('Research stats:', { 
      totalSubmissions, 
      pendingSubmissions, 
      approvedSubmissions, 
      rejectedSubmissions 
    }); // Debug log

    res.json({
      success: true,
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions
    });

  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching activity statistics',
      error: error.message 
    });
  }
});

// Get recent activities and counts
adminRoutes.get('/recent-activities', authenticateToken, async (req, res) => {
  try {
    // Get recent submissions
    const recentSubmissions = await Research.find()
      .sort({ uploadDate: -1 })
      .limit(5)
      .populate('mongoId', 'name')
      .select('title uploadDate status mongoId');

    // Get total counts
    const [totalSubmissions, pendingSubmissions, acceptedSubmissions, rejectedSubmissions] = 
    await Promise.all([
      Research.countDocuments(),
      Research.countDocuments({ status: 'Pending' }),
      Research.countDocuments({ status: 'Accepted' }),
      Research.countDocuments({ status: 'Rejected' })
    ]);

    console.log('Submission counts:', {
      total: totalSubmissions,
      pending: pendingSubmissions,
      accepted: acceptedSubmissions,
      rejected: rejectedSubmissions
    });

    // Format activities
    const activities = recentSubmissions.map(submission => ({
      type: 'submission',
      description: `Research "${submission.title}" submitted by ${submission.mongoId?.name || 'Unknown'}`,
      timestamp: submission.uploadDate,
      status: submission.status
    }));

    res.json({
      success: true,
      activities,
      counts: {
        total: totalSubmissions,
        pending: pendingSubmissions,
        accepted: acceptedSubmissions,
        rejected: rejectedSubmissions
      }
    });

  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching recent activities' 
    });
  }
});

// Add new endpoints for edit mode management
adminRoutes.post('/edit-mode', authenticateToken, async (req, res) => {
  try {
    const { isEditing, editor } = req.body;
    
    // If someone wants to enter edit mode but someone else is already editing
    if (isEditing && currentEditor && currentEditor !== editor) {
      return res.status(403).json({ 
        success: false,
        message: `Another admin (${currentEditor}) is currently editing` 
      });
    }

    // Update editor state
    if (isEditing) {
      currentEditor = editor;
    } else if (currentEditor === editor) {
      currentEditor = null;
    }

    // Broadcast the change through Socket.IO
    io.emit('editModeChange', { isEditing, editor });

    res.json({ 
      success: true, 
      currentEditor,
      message: isEditing ? 'Edit mode enabled' : 'Edit mode disabled'
    });
  } catch (error) {
    console.error('Error updating edit mode:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Add endpoint to check current editor
adminRoutes.get('/edit-mode', authenticateToken, async (req, res) => {
  res.json({ 
    success: true,
    currentEditor 
  });
});

// Create new admin account (Super Admin only)
adminRoutes.post('/create-admin', authenticateToken, async (req, res) => {
    try {
        // Verify if requester is super admin
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Only super admin can create admin accounts'
            });
        }

        const { name, email, password } = req.body;

        // Log the password before and after hashing
        console.log('Before hashing:', {
            originalPassword: password,
            passwordLength: password.length
        });

        const hashedPassword = await bcrypt.hash(password, 10);

        console.log('After hashing:', {
            hashedPassword: hashedPassword,
            hashedLength: hashedPassword.length,
            isHashed: hashedPassword.startsWith('$2b$')
        });

        // Create new admin with hashed password
        const newAdmin = new Admin({
            name,
            email,
            password: hashedPassword
        });

        await newAdmin.save();

        // Log the saved admin's password
        console.log('Saved in database:', {
            savedPassword: newAdmin.password,
            isSameAsHashed: newAdmin.password === hashedPassword
        });

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            passwordIsHashed: newAdmin.password.startsWith('$2b$')
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all admin accounts (Super Admin only)
adminRoutes.get('/admins', authenticateToken, async (req, res) => {
    try {
        // Verify if requester is super admin
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Only super admin can view admin accounts'
            });
        }

        const admins = await Admin.find()
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            admins
        });

    } catch (error) {
        console.error('Error fetching admins:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching admin accounts'
        });
    }
});

// Update admin status (activate/deactivate)
adminRoutes.put('/admins/:id/status', authenticateToken, async (req, res) => {
    try {
        // Verify if requester is super admin
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Only super admin can modify admin accounts'
            });
        }

        const { id } = req.params;
        const { isActive } = req.body;

        const admin = await Admin.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        ).select('-password');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.status(200).json({
            success: true,
            admin,
            message: `Admin account ${isActive ? 'activated' : 'deactivated'} successfully`
        });

    } catch (error) {
        console.error('Error updating admin status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating admin status'
        });
    }
});

// Get all researches (both active and archived)
adminRoutes.get('/all-researches', authenticateToken, async (req, res) => {
  try {
    const researches = await Research.find({ status: 'Accepted' })
      .select('title authors course uploadDate abstract keywords driveFileId archived')
      .sort({ uploadDate: -1 });

    res.json(researches);
  } catch (error) {
    console.error('Error fetching researches:', error);
    res.status(500).json({ message: 'Error fetching researches' });
  }
});

// Archive research
adminRoutes.put('/research/:id/archive', authenticateToken, async (req, res) => {
  try {
    const research = await Research.findByIdAndUpdate(
      req.params.id,
      { archived: true },
      { new: true }
    );

    if (!research) {
      return res.status(404).json({ message: 'Research not found' });
    }

    // Send back the updated research
    res.json(research);
  } catch (error) {
    console.error('Error archiving research:', error);
    res.status(500).json({ message: 'Error archiving research' });
  }
});

// Restore research
adminRoutes.put('/research/:id/restore', authenticateToken, async (req, res) => {
  try {
    const research = await Research.findByIdAndUpdate(
      req.params.id,
      { archived: false },
      { new: true }
    );

    if (!research) {
      return res.status(404).json({ message: 'Research not found' });
    }

    res.json(research);
  } catch (error) {
    console.error('Error restoring research:', error);
    res.status(500).json({ message: 'Error restoring research' });
  }
});

// Get all courses
adminRoutes.get('/courses', authenticateToken, async (req, res) => {
  try {
    // Get unique courses from Student model
    const courses = await Student.distinct('course');
    // Format courses into objects
    const formattedCourses = courses
      .filter(course => course) // Remove null/empty values
      .map(course => ({
        _id: course,
        name: course
      }));
    
    res.json(formattedCourses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Error fetching courses' });
  }
});

// Generate report
adminRoutes.get('/generate-report', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, course, type } = req.query;
    let query = { status: 'Accepted' };

    if (startDate && endDate) {
      query.uploadDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    let result;
    switch (type) {
      case 'submissions':
        const researches = await Research.find(query)
          .populate({
            path: 'mongoId',
            model: 'Student',
            select: 'course name',
            match: course ? { course: course } : {}
          })
          .populate('adviser', 'name')
          .sort({ uploadDate: -1 });
        
        // Filter out results where student doesn't match course criteria
        result = researches.filter(r => r.mongoId);
        
        // Format the results
        result = result.map(r => ({
          title: r.title,
          authors: r.authors,
          course: r.mongoId?.course || 'N/A',
          status: r.status,
          uploadDate: r.uploadDate
        }));
        break;

      case 'status':
        result = await Research.aggregate([
          { $match: query },
          {
            $lookup: {
              from: 'students',
              localField: 'mongoId',
              foreignField: '_id',
              as: 'student'
            }
          },
          {
            $match: course ? { 'student.course': course } : {}
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              researches: { $push: { title: '$title', date: '$uploadDate' } }
            }
          }
        ]);
        break;

      case 'course':
        result = await Research.aggregate([
          { $match: query },
          {
            $lookup: {
              from: 'students',
              localField: 'mongoId',
              foreignField: '_id',
              as: 'student'
            }
          },
          { $unwind: '$student' },
          {
            $match: course ? { 'student.course': course } : {}
          },
          {
            $group: {
              _id: '$student.course',
              count: { $sum: 1 },
              researches: { $push: { title: '$title', date: '$uploadDate' } }
            }
          }
        ]);
        break;

      default:
        result = [];
    }

    res.json(result);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Error generating report' });
  }
});

// Download report
adminRoutes.get('/download-report', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, course, format } = req.query;
    let query = { status: 'Accepted' };

    if (startDate && endDate) {
      query.uploadDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const researches = await Research.find(query)
      .populate({
        path: 'mongoId',
        model: 'Student',
        select: 'course name',
        match: course ? { course: course } : {}
      })
      .populate('adviser', 'name')
      .sort({ uploadDate: -1 });

    // Filter out results where student doesn't match course criteria
    const filteredResearches = researches.filter(r => r.mongoId);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Research Report');

      worksheet.columns = [
        { header: 'Title', key: 'title', width: 40 },
        { header: 'Authors', key: 'authors', width: 30 },
        { header: 'Course', key: 'course', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Submission Date', key: 'uploadDate', width: 15 }
      ];

      filteredResearches.forEach(research => {
        worksheet.addRow({
          title: research.title,
          authors: Array.isArray(research.authors) ? research.authors.join(', ') : research.authors,
          course: research.mongoId?.course || 'N/A',
          status: research.status,
          uploadDate: new Date(research.uploadDate).toLocaleDateString()
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=research-report-${new Date().toISOString().split('T')[0]}.xlsx`);

      await workbook.xlsx.write(res);
      return res.end();
    } else if (format === 'pdf') {
      const pdfGenerator = new PDFGenerator();
      const doc = pdfGenerator.generateReport(filteredResearches, startDate, endDate, course);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=research-report-${new Date().toISOString().split('T')[0]}.pdf`);

      // Create a write stream
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        res.end(result);
      });

      // Finalize the PDF
      doc.end();
    } else {
      return res.status(400).json({ message: 'Invalid format specified' });
    }
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ message: 'Error downloading report' });
  }
});

// Update admin permissions
adminRoutes.put('/admins/:id/permissions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const admin = await Admin.findByIdAndUpdate(
      id,
      { permissions },
      { new: true }
    ).select('-password');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      admin,
      message: 'Permissions updated successfully'
    });

  } catch (error) {
    console.error('Error updating admin permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating permissions'
    });
  }
});

// Get activity stats
adminRoutes.get('/activity-stats', authenticateToken, async (req, res) => {
  try {
    // Get research submission stats
    const totalSubmissions = await Research.countDocuments();
    const pendingSubmissions = await Research.countDocuments({ status: 'Pending' });
    const approvedSubmissions = await Research.countDocuments({ status: 'Accepted' });
    const rejectedSubmissions = await Research.countDocuments({ status: 'Rejected' });

    res.json({
      success: true,
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching activity statistics' 
    });
  }
});

// Get recent activities
adminRoutes.get('/recent-activities', authenticateToken, async (req, res) => {
  try {
    // Get recent research submissions
    const recentSubmissions = await Research.find()
      .sort({ uploadDate: -1 })
      .limit(5)
      .populate('mongoId', 'name')
      .select('title status uploadDate mongoId');

    // Get recent adviser requests
    const recentRequests = await AdviserRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('instructor', 'name')
      .select('status createdAt instructor');

    // Combine and format activities
    const activities = [
      ...recentSubmissions.map(submission => ({
        type: 'submission',
        description: `Research "${submission.title}" submitted by ${submission.mongoId?.name || 'Unknown'}`,
        timestamp: submission.uploadDate,
        status: submission.status
      })),
      ...recentRequests.map(request => ({
        type: 'adviser_request',
        description: `Adviser request from ${request.instructor?.name || 'Unknown'}`,
        timestamp: request.createdAt,
        status: request.status
      }))
    ];

    // Sort by timestamp
    activities.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      activities: activities.slice(0, 10) // Get most recent 10 activities
    });

  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching recent activities' 
    });
  }
});

// Add these new endpoints

// Get research status trends
adminRoutes.get('/research-status-trends', authenticateToken, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    // Generate array of last 6 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      return {
        month: date.getMonth(),
        year: date.getFullYear(),
        label: `${months[date.getMonth()]} ${date.getFullYear()}`
      };
    });

    // Get monthly submission counts by status
    const trends = await Research.aggregate([
      {
        $match: {
          uploadDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$uploadDate" },
            year: { $year: "$uploadDate" },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format data for Chart.js
    const formattedData = {
      labels: last6Months.map(m => m.label),
      datasets: [
        {
          label: 'Pending',
          data: last6Months.map(monthData => {
            const found = trends.find(
              trend => 
                trend._id.month === monthData.month + 1 && 
                trend._id.year === monthData.year &&
                trend._id.status === 'Pending'
            );
            return found ? found.count : 0;
          }),
          borderColor: 'rgb(255, 206, 86)', // Yellow
          backgroundColor: 'rgba(255, 206, 86, 0.2)',
          tension: 0.1
        },
        {
          label: 'Approved',
          data: last6Months.map(monthData => {
            const found = trends.find(
              trend => 
                trend._id.month === monthData.month + 1 && 
                trend._id.year === monthData.year &&
                (trend._id.status === 'Approved' || trend._id.status === 'Accepted')
            );
            return found ? found.count : 0;
          }),
          borderColor: 'rgb(75, 192, 192)', // Green
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        },
        {
          label: 'Rejected',
          data: last6Months.map(monthData => {
            const found = trends.find(
              trend => 
                trend._id.month === monthData.month + 1 && 
                trend._id.year === monthData.year &&
                trend._id.status === 'Rejected'
            );
            return found ? found.count : 0;
          }),
          borderColor: 'rgb(255, 99, 132)', // Red
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.1
        }
      ]
    };

    console.log('Sending trend data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching research trends:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching research trends'
    });
  }
});

// Get submission trends
adminRoutes.get('/submission-trends', authenticateToken, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const trends = await Research.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1
        }
      }
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // If no data, provide sample data for the last 6 months
    if (trends.length === 0) {
      const sampleData = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        return {
          month: `${months[date.getMonth()]} ${date.getFullYear()}`,
          count: 0
        };
      });

      return res.json({
        success: true,
        data: sampleData
      });
    }

    const formattedData = trends.map(item => ({
      month: `${months[item._id.month - 1]} ${item._id.year}`,
      count: item.count
    }));

    res.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching submission trends:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submission trends'
    });
  }
});

// Get research statistics
adminRoutes.get('/research-stats', authenticateToken, async (req, res) => {
  try {
    // Get counts
    const total = await Research.countDocuments();
    const pending = await Research.countDocuments({ status: 'Pending' });
    const accepted = await Research.countDocuments({ status: 'Accepted' });
    const rejected = await Research.countDocuments({ status: 'Rejected' });

    console.log('Sending stats:', { total, pending, accepted, rejected }); // Debug log

    res.json({
      success: true,
      total,
      pending,
      accepted,
      rejected
    });

  } catch (error) {
    console.error('Error getting research stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch research statistics'
    });
  }
});

// Get user trends
adminRoutes.get('/user-trends', authenticateToken, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    // Generate array of last 6 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      return {
        month: date.getMonth(),
        year: date.getFullYear(),
        label: `${months[date.getMonth()]} ${date.getFullYear()}`
      };
    });

    // Get student registration trends
    const studentTrends = await Student.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get instructor registration trends
    const instructorTrends = await Instructor.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format data for Chart.js
    const formattedData = {
      labels: last6Months.map(m => m.label),
      datasets: [
        {
          label: 'Student Registrations',
          data: last6Months.map(monthData => {
            const found = studentTrends.find(
              trend => 
                trend._id.month === monthData.month + 1 && 
                trend._id.year === monthData.year
            );
            return found ? found.count : 0;
          }),
          borderColor: 'rgb(75, 192, 192)', // Green
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        },
        {
          label: 'Instructor Registrations',
          data: last6Months.map(monthData => {
            const found = instructorTrends.find(
              trend => 
                trend._id.month === monthData.month + 1 && 
                trend._id.year === monthData.year
            );
            return found ? found.count : 0;
          }),
          borderColor: 'rgb(255, 99, 132)', // Red
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.1
        }
      ]
    };

    console.log('Sending user trend data:', formattedData);

    res.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching user trends:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user trends'
    });
  }
});

// Get user distribution
adminRoutes.get('/user-distribution', authenticateToken, async (req, res) => {
  try {
    // Get total counts
    const [studentCount, instructorCount] = await Promise.all([
      Student.countDocuments(),
      Instructor.countDocuments()
    ]);

    // Format data for Pie chart
    const formattedData = {
      labels: ['Students', 'Instructors'],
      datasets: [{
        data: [studentCount, instructorCount],
        backgroundColor: [
          'rgba(75, 192, 192, 0.8)',  // Green for students
          'rgba(255, 99, 132, 0.8)'   // Red for instructors
        ],
        borderColor: [
          'rgb(75, 192, 192)',
          'rgb(255, 99, 132)'
        ],
        borderWidth: 1
      }]
    };

    console.log('Sending user distribution data:', formattedData);

    res.json({
      success: true,
      data: formattedData,
      total: studentCount + instructorCount
    });

  } catch (error) {
    console.error('Error fetching user distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user distribution'
    });
  }
});

// Add this route temporarily to check passwords
adminRoutes.get('/check-hashing', async (req, res) => {
    try {
        // Create two identical passwords
        const testPassword = "test123";
        
        // Hash the same password twice
        const hash1 = await bcrypt.hash(testPassword, 10);
        const hash2 = await bcrypt.hash(testPassword, 10);
        
        console.log('Test Results:');
        console.log('Original Password:', testPassword);
        console.log('First Hash:', hash1);
        console.log('Second Hash:', hash2);
        console.log('Hashes are different:', hash1 !== hash2);
        console.log('Both start with $2b$:', hash1.startsWith('$2b$') && hash2.startsWith('$2b$'));
        
        // Verify both hashes work with original password
        const verify1 = await bcrypt.compare(testPassword, hash1);
        const verify2 = await bcrypt.compare(testPassword, hash2);
        
        res.json({
            originalPassword: testPassword,
            hash1: hash1,
            hash2: hash2,
            hashesAreDifferent: hash1 !== hash2,
            properlyHashed: hash1.startsWith('$2b$'),
            verifyResult1: verify1,
            verifyResult2: verify2
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a utility route to generate hashed password (use this once to generate the hash)
adminRoutes.post('/generate-superadmin-hash', async (req, res) => {
    try {
        const { password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        console.log('Generated hash:', hashedPassword);
        
        res.json({ 
            message: 'Store this hash in your environment variables',
            hashedPassword 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add this simple test endpoint
adminRoutes.get('/test-console', (req, res) => {
    console.log('Test endpoint reached');
    console.log('Basic console logging is working');
    res.json({ message: 'Test endpoint hit' });
});

adminRoutes.get('/verify-salting', async (req, res) => {
    try {
        // Basic endpoint hit verification
        console.log('Verify-salting endpoint hit');
        console.log('Starting salting verification...');
        
        // Create test password and log it
        const testPassword = "test123";
        console.log('\n=== SALTING VERIFICATION ===');
        console.log('Test Password:', testPassword);
        
        // Generate salt and log it
        const salt = await bcrypt.genSalt(10);
        console.log('Generated Salt:', salt);
        
        // Generate hash and log it
        const hashedPassword = await bcrypt.hash(testPassword, salt);
        console.log('Final Hashed Password:', hashedPassword);
        
        // Log verification details
        console.log('Salt Rounds Used:', hashedPassword.split('$')[2]);
        console.log('Hash Format:', hashedPassword.split('$')[1]);
        console.log('Is Properly Hashed:', hashedPassword.startsWith('$2b$'));
        console.log('===========================\n');
        
        res.json({
            success: true,
            message: 'Check server console for salting verification'
        });
        
    } catch (error) {
        console.error('Salting verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default adminRoutes;
