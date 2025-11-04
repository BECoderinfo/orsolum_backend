/**
 * This file is for all the response Messages and status so we can change it easily at any time.
 * @method messages contains all the messages[req.userLanguage].
 * @method status is for response status.
 * @method jsonStatus is for internal json status. we can change response status to 200 only for all response because browsers logs the 4** errors to console
 */

export const messages = {
  English: {
    error: 'Something went wrong.',
    error_with: 'Something went wrong with ##.',
    reg_success: 'Welcome! You are registered successfully.',
    deposit_amount: 'You must add ## rupees to purchase the tickets',
    already_assigned: '## is already assigned to a user, and cannot be reassigned',
    success: '## fetched successfully.',
    delete_success: '## deleted successfully.',
    action_success: '##  successful.',
    cancel_success: '##  cancel successful.',
    status_wrong_pass: 'Status Should be Accept Or Reject',

    action_failure: '##  failed.',
    generate_success: '## generated successfully.',
    add_success: '## added successfully.',
    update_success: '## updated successfully.',
    del_success: '## deleted successfully.',
    submit_success: '## submitted successfully.',
    fields_missing: '## missing',
    fail: 'Failed',
    route_not_found: 'Page Not Found.',
    fix_len_err: '## must be # character long.',
    required: '## is required.',
    invalid: '## is invalid.',
    valid: '## is valid.',
    already_exist: '## is already exist.',
    already_added: '## is already Added.',
    not_exist: '## is not exist.',
    user_not_found: 'User not found with given mobile number.',
    not_found: '## not found',
    err_unauthorized: 'Authentication failed. Please login again!',
    user_blocked: 'You are blocked by our system. Contact administrator for more details.',
    err_otp_expired: 'OTP is no longer valid, Please try again.',
    succ_logout: 'You have successfully logged out!',
    succ_login: 'Welcome Back! You have logged in successfully.',
    went_wrong_with: 'Something went wrong with ##',
    presigned_succ: 'Pre-signed URL generated successfully.',
    must_alpha_num: 'Username allows alphanumeric characters only.',
    auth_failed: 'Please enter a valid credentials.',
    err_resend_otp: 'You can resend OTP only after ## seconds.',
    old_new_password_same: 'Old and New password can\'t be same.',
    wrong_old_password: 'Please enter a correct old password.',
    user_forgot_err: 'We didn\'t find any account in our system. Please check your input first.',
    OTP_sent_succ: 'OTP sent successfully.',
    verify_otp_err: 'Entered OTP is invalid or expired.',
    block_user_err: 'This user is blocked by admin. Please contact to administrator for further assistance.',
    reset_pass_succ: 'Your password has been reset successfully. Please login using new password.',
    forgot_link_err: 'Link is expired or invalid. Please try again or contact to administrator for further assistance.',
    already_verified: '## is already verified.',
    kyc_under_review: 'Your KYC is currently under review. Please contact administrator if you need any assistance.',
    limit_reached: 'You have reached a limit for sending ##. Please try after some time.',
    err_bank_update: 'You can update bank details only once. Contact to administrator for change request.',
    link_expire_invalid: 'This link seems to be expired or invalid. Please try again.',
    kyc_status_v_err: 'You can\'t verify this document.',
    less_then_err: '## should be less then #.',
    greater_then_err: '## should be greater then #.',
    fixed_size_err: '## should be only #.',
    same_value_err: '## and # can\'t be same.',
    unique_team_player_err: 'All team players should be unique',
    match_started: 'Match already started.',
    league_full: 'League is already full.',
    user_already_joined: 'You have already joined the league with this team.',
    multiple_join_err: 'You can\'t join the league with multiple teams.',
    team_join_limit_err: 'You have reached a limit for team join.',
    match_not_complete: 'Match is not completed.',
    no_matchplayer: 'No Match player scheduled for this match.',
    max_team_player_err: 'You can select maximum seven player from a team.',
    win_amount_err: 'Choose Winning amount between 1 and 10000.',
    contest_size_err: 'Choose Contest size between 2 and 500.',

    invalid_promo_err: 'Entered promocode is either expired or inactive.',
    promo_amount_err: 'This promocode is only available for deposit amount between #₹ to ##₹.',
    promo_usage_limit: 'You have reached usage limit for this promocode.',
    is_not_active: '## is not active.',
    is_active: '## is active.',
    insuff_balance: 'Insufficient balance for ##',

    image_not_required: '## is not required',
    contest_past_date_err: 'Contest date should be a future date.',
    contest_rp_ac: 'Ready to play contest will always auto create.',
    wp_percentage_err: 'Total of winning pattern percentage should be 100%.',
    past_date_err: '## date should be a future date.',
    compiled_success: 'File compiled successfully.',
    upload_excel_file: 'Please upload a excel file',
    access_denied: 'You don\'t have permission'

  }
}

export const status = {
  OK: 200,
  Create: 201,
  Deleted: 204,
  BadRequest: 400,
  Unauthorized: 401,
  NotFound: 404,
  Forbidden: 403,
  NotAcceptable: 406,
  ExpectationFailed: 417,
  Locked: 423,
  InternalServerError: 500,
  UnprocessableEntity: 422,
  ResourceExist: 409,
  TooManyRequest: 429
}

export const jsonStatus = {
  OK: 200,
  Create: 201,
  Deleted: 204,
  BadRequest: 400,
  Unauthorized: 401,
  NotFound: 404,
  Forbidden: 403,
  NotAcceptable: 406,
  ExpectationFailed: 417,
  Locked: 423,
  InternalServerError: 500,
  UnprocessableEntity: 422,
  ResourceExist: 409,
  TooManyRequest: 429
}

// Simple standard API response helper expected by shiprocketController
export const apiResponse = (success, message, data) => ({
  success,
  message,
  data
});