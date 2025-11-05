/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// HTML structure for the volunteer form
const createFormHTML = () => `
  <form id="volunteer-form" onsubmit="handleVolunteerForm(event)" method="post">
    <div class="form-grid-type">
      <div class="form-group-type">
        <label class="form-label-type font-mono" for="firstName">FIRST NAME *</label>
        <input
          type="text"
          name="firstName"
          id="firstName"
          class="form-input-type"
          placeholder="Your first name"
          required
          minlength="2"
          maxlength="100"
          autocomplete="given-name"
          aria-required="true"
          aria-describedby="firstName-hint"
        />
        <span id="firstName-hint" class="form-hint" style="display: none;"></span>
      </div>
      <div class="form-group-type">
        <label class="form-label-type font-mono" for="lastName">LAST NAME *</label>
        <input
          type="text"
          name="lastName"
          id="lastName"
          class="form-input-type"
          placeholder="Your last name"
          required
          minlength="2"
          maxlength="100"
          autocomplete="family-name"
          aria-required="true"
          aria-describedby="lastName-hint"
        />
        <span id="lastName-hint" class="form-hint" style="display: none;"></span>
      </div>
    </div>

    <div class="form-group-type">
      <label class="form-label-type font-mono" for="email">EMAIL *</label>
      <input
        type="email"
        name="email"
        id="email"
        class="form-input-type"
        placeholder="your@email.com"
        required
        maxlength="254"
        autocomplete="email"
        inputmode="email"
        aria-required="true"
        aria-describedby="email-hint"
      />
      <span id="email-hint" class="form-hint" style="display: none;"></span>
    </div>

    <div class="form-group-type">
      <label class="form-label-type font-mono" for="phone">PHONE</label>
      <input
        type="tel"
        name="phone"
        id="phone"
        class="form-input-type"
        placeholder="(303) 555-0123"
        maxlength="50"
        autocomplete="tel"
        inputmode="tel"
      />
    </div>

    <div class="form-group-type">
      <label class="form-label-type font-mono">AREAS OF INTEREST</label>
      <div class="checkbox-group-type">
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="setup" />
          <span>Event Setup/Breakdown</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="registration" />
          <span>Registration Desk</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="artist" />
          <span>Artist Support</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="merchandise" />
          <span>Merchandise Sales</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="info" />
          <span>Information Booth</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="area" value="social" />
          <span>Social Media Team</span>
        </label>
      </div>
    </div>

    <div class="form-group-type">
      <label class="form-label-type font-mono">AVAILABILITY</label>
      <div class="checkbox-group-type">
        <label class="checkbox-type">
          <input type="checkbox" name="day" value="friday" />
          <span>Friday, May 15</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="day" value="saturday" />
          <span>Saturday, May 16</span>
        </label>
        <label class="checkbox-type">
          <input type="checkbox" name="day" value="sunday" />
          <span>Sunday, May 17</span>
        </label>
      </div>
    </div>

    <div class="form-group-type">
      <label class="form-label-type font-mono">WHY DO YOU WANT TO VOLUNTEER?</label>
      <textarea
        name="message"
        class="form-textarea-type"
        rows="4"
        placeholder="Tell us about your motivation..."
      ></textarea>
    </div>

    <div class="form-actions-type">
      <button type="submit" id="volunteerSubmitBtn" class="form-button-type volunteer-submit">
        SUBMIT APPLICATION
      </button>
    </div>
  </form>
`;

// The actual handleVolunteerForm function from about.html
const createHandleVolunteerFormFunction = () => {
  window.handleVolunteerForm = async function(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById('volunteerSubmitBtn');
    const formData = new FormData(form);

    // Collect form data
    const data = {
      firstName: formData.get("firstName") || "",
      lastName: formData.get("lastName") || "",
      email: formData.get("email") || "",
      phone: formData.get("phone") || "",
      areasOfInterest: formData.getAll("area"),
      availability: formData.getAll("day"),
      message: formData.get("message") || ""
    };

    // Helper function to show error message
    function showErrorMessage(message, field = null) {
      if (field) {
        // Show field-specific error
        const hintElement = document.getElementById(`${field}-hint`);
        if (hintElement) {
          hintElement.textContent = message;
          hintElement.style.display = 'block';
          hintElement.style.color = '#dc2626';
          hintElement.style.marginTop = '4px';
          hintElement.style.fontSize = '0.875rem';

          // Scroll to and focus the field
          const fieldElement = document.getElementById(field);
          if (fieldElement) {
            fieldElement.style.borderColor = '#dc2626';
            fieldElement.setAttribute('aria-invalid', 'true');
            setTimeout(() => {
              fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              fieldElement.focus();
            }, 100);
          }
        }
      } else {
        // Show generic error as alert
        alert(message);
      }
    }

    // Helper function to clear all errors
    function clearAllErrors() {
      document.querySelectorAll('.form-hint').forEach(hint => {
        hint.style.display = 'none';
        hint.textContent = '';
      });
      document.querySelectorAll('.form-input-type').forEach(input => {
        input.style.borderColor = '';
        input.setAttribute('aria-invalid', 'false');
      });
    }

    // Disable submit button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'SUBMITTING...';

    try {
      const response = await fetch('/api/volunteer/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        // Success - show confirmation message
        clearAllErrors();
        alert(`Thank you, ${data.firstName}! We've received your volunteer application and sent you a confirmation email. We'll be in touch as we approach the festival!`);
        form.reset();
        submitBtn.textContent = 'SUBMIT APPLICATION';
      } else {
        // Error from API - show specific error message
        clearAllErrors();

        if (result.field && result.error) {
          // Field-specific validation error
          showErrorMessage(result.error, result.field);
        } else if (result.error) {
          // Generic error with message from server
          showErrorMessage(result.error);
        } else {
          // Unknown error
          showErrorMessage('Unable to submit application. Please check your information and try again.');
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'SUBMIT APPLICATION';
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      clearAllErrors();

      // Network error or other exception
      if (error.message && error.message !== 'Failed to fetch') {
        showErrorMessage(`Error: ${error.message}\n\nIf this problem persists, please email us at alocubanoboulderfest@gmail.com`);
      } else {
        showErrorMessage('Network error. Please check your internet connection and try again.\n\nIf this problem persists, please email us at alocubanoboulderfest@gmail.com');
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT APPLICATION';
    }
  };
};

describe('Volunteer Form Submission', () => {
  beforeEach(() => {
    // Set up DOM with form HTML
    document.body.innerHTML = createFormHTML();

    // Mock global functions
    global.fetch = vi.fn();
    global.alert = vi.fn();

    // Create the handleVolunteerForm function
    createHandleVolunteerFormFunction();

    // Attach the handler to the form
    const form = document.getElementById('volunteer-form');
    form.addEventListener('submit', (e) => {
      window.handleVolunteerForm(e);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '';
  });

  describe('Form Data Collection', () => {
    it('should collect all form fields correctly', async () => {
      // Fill form fields
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@gmail.com';
      document.getElementById('phone').value = '123-456-7890';
      document.querySelector('textarea[name="message"]').value = 'I want to volunteer!';

      // Check area checkboxes
      document.querySelector('input[value="setup"]').checked = true;
      document.querySelector('input[value="registration"]').checked = true;

      // Check day checkboxes
      document.querySelector('input[value="friday"]').checked = true;

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Thank you!' })
      });

      // Trigger form submission
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Verify fetch was called with correct data
      expect(global.fetch).toHaveBeenCalledWith('/api/volunteer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@gmail.com',
          phone: '123-456-7890',
          areasOfInterest: ['setup', 'registration'],
          availability: ['friday'],
          message: 'I want to volunteer!'
        })
      });
    });

    it('should collect only required fields when optional fields are empty', async () => {
      // Fill only required fields
      document.getElementById('firstName').value = 'Jane';
      document.getElementById('lastName').value = 'Smith';
      document.getElementById('email').value = 'jane@example.com';

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Trigger form submission
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Verify fetch was called with correct data (empty arrays and strings for optional fields)
      const callArgs = global.fetch.mock.calls[0][1];
      const bodyData = JSON.parse(callArgs.body);

      expect(bodyData).toEqual({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        phone: '',
        areasOfInterest: [],
        availability: [],
        message: ''
      });
    });
  });

  describe('Success Handling', () => {
    it('should show confirmation alert on successful submission', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Thank you!' })
      });

      // Submit form
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for async handling
      await vi.waitFor(() => {
        expect(global.alert).toHaveBeenCalled();
      });

      expect(global.alert).toHaveBeenCalledWith(
        "Thank you, John! We've received your volunteer application and sent you a confirmation email. We'll be in touch as we approach the festival!"
      );
    });

    it('should reset form on successful submission', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';
      document.getElementById('phone').value = '555-1234';
      document.querySelector('input[value="setup"]').checked = true;

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Submit form
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for async handling
      await vi.waitFor(() => {
        expect(document.getElementById('firstName').value).toBe('');
      });

      // Verify form is reset
      expect(document.getElementById('firstName').value).toBe('');
      expect(document.getElementById('lastName').value).toBe('');
      expect(document.getElementById('email').value).toBe('');
      expect(document.getElementById('phone').value).toBe('');
      expect(document.querySelector('input[value="setup"]').checked).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should display field-specific validation errors', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock field-specific error response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'First name is required',
          field: 'firstName'
        })
      });

      // Submit form
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for error display
      await vi.waitFor(() => {
        const hint = document.getElementById('firstName-hint');
        expect(hint.textContent).toContain('required');
      });

      const hint = document.getElementById('firstName-hint');
      const field = document.getElementById('firstName');

      expect(hint.textContent).toBe('First name is required');
      expect(hint.style.display).toBe('block');
      expect(hint.style.color).toBe('#dc2626');
      expect(field.style.borderColor).toBe('#dc2626');
      expect(field.getAttribute('aria-invalid')).toBe('true');
    });

    it('should show alert for generic server errors', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock generic error response (no field)
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Server error occurred'
        })
      });

      // Submit form
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for error handling
      await vi.waitFor(() => {
        expect(global.alert).toHaveBeenCalled();
      });

      expect(global.alert).toHaveBeenCalledWith('Server error occurred');
    });

    it('should show network error message for fetch failures', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock network error
      global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      // Submit form
      const form = document.getElementById('volunteer-form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      // Wait for error handling
      await vi.waitFor(() => {
        expect(global.alert).toHaveBeenCalled();
      });

      expect(global.alert).toHaveBeenCalledWith(
        'Network error. Please check your internet connection and try again.\n\nIf this problem persists, please email us at alocubanoboulderfest@gmail.com'
      );
    });
  });

  describe('Loading States', () => {
    it('should disable submit button during submission', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock slow response that returns an error (so button gets re-enabled)
      global.fetch.mockImplementationOnce(() => new Promise(resolve => {
        setTimeout(() => resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Some error', field: 'firstName' })
        }), 100);
      }));

      const submitBtn = document.getElementById('volunteerSubmitBtn');

      // Submit form
      const form = document.getElementById('volunteer-form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      // Check button is disabled immediately
      expect(submitBtn.disabled).toBe(true);

      // Wait for completion (button should be re-enabled on error)
      await vi.waitFor(() => {
        expect(submitBtn.disabled).toBe(false);
      }, { timeout: 500 });

      expect(submitBtn.disabled).toBe(false);
    });

    it('should change submit button text to "SUBMITTING..." during submission', async () => {
      // Fill form
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'john@example.com';

      // Mock slow response
      global.fetch.mockImplementationOnce(() => new Promise(resolve => {
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true })
        }), 100);
      }));

      const submitBtn = document.getElementById('volunteerSubmitBtn');

      expect(submitBtn.textContent.trim()).toBe('SUBMIT APPLICATION');

      // Submit form
      const form = document.getElementById('volunteer-form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      // Check button text changes immediately
      expect(submitBtn.textContent).toBe('SUBMITTING...');

      // Wait for completion
      await vi.waitFor(() => {
        expect(submitBtn.textContent).toBe('SUBMIT APPLICATION');
      }, { timeout: 500 });

      expect(submitBtn.textContent).toBe('SUBMIT APPLICATION');
    });
  });

  describe('Helper Functions', () => {
    it('should display field-specific errors correctly with showErrorMessage', async () => {
      // Fill and submit form to trigger error handling
      document.getElementById('firstName').value = 'John';
      document.getElementById('lastName').value = 'Doe';
      document.getElementById('email').value = 'invalid-email';

      // Mock validation error
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Please enter a valid email address',
          field: 'email'
        })
      });

      // Submit form
      const form = document.getElementById('volunteer-form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      // Wait for error to be displayed
      await vi.waitFor(() => {
        const hint = document.getElementById('email-hint');
        expect(hint.textContent).toBe('Please enter a valid email address');
      });

      const hint = document.getElementById('email-hint');
      const field = document.getElementById('email');

      // Verify error display properties
      expect(hint.textContent).toBe('Please enter a valid email address');
      expect(hint.style.display).toBe('block');
      expect(hint.style.color).toBe('#dc2626');
      expect(hint.style.marginTop).toBe('4px');
      expect(hint.style.fontSize).toBe('0.875rem');
      expect(field.style.borderColor).toBe('#dc2626');
      expect(field.getAttribute('aria-invalid')).toBe('true');
    });

    it('should clear all error states with clearAllErrors', async () => {
      // First, create error state
      document.getElementById('firstName').value = 'J';
      document.getElementById('lastName').value = 'D';
      document.getElementById('email').value = 'invalid';

      // Mock validation error
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'First name must be at least 2 characters',
          field: 'firstName'
        })
      });

      // Submit form to create error
      const form = document.getElementById('volunteer-form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      // Wait for error to appear
      await vi.waitFor(() => {
        const hint = document.getElementById('firstName-hint');
        expect(hint.style.display).toBe('block');
      });

      // Now submit successfully to trigger clearAllErrors
      document.getElementById('firstName').value = 'John';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      // Wait for success handling
      await vi.waitFor(() => {
        expect(global.alert).toHaveBeenCalled();
      });

      // Verify all errors are cleared
      const hint = document.getElementById('firstName-hint');
      const field = document.getElementById('firstName');

      expect(hint.style.display).toBe('none');
      expect(hint.textContent).toBe('');
      expect(field.style.borderColor).toBe('');
      expect(field.getAttribute('aria-invalid')).toBe('false');
    });
  });
});
